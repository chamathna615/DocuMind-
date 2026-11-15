import { OAuth2Client } from "google-auth-library";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import User from "../models/User.js";
import Lecture from "../models/Lecture.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Notification from "../models/Notification.js";
import { notifyUser } from "../services/notificationService.js";
import { deleteUserData } from "../services/userCleanup.js";
import generateToken from "../utils/generateToken.js";
import { securityLog, hashEmail } from "../utils/securityLog.js";
import { asString, isValidEmail, validatePassword } from "../utils/validators.js";
import { createToken, hashToken, isTokenFormat } from "../utils/tokens.js";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendAlreadyRegisteredEmail,
} from "../services/emailService.js";

const isProd = process.env.NODE_ENV === "production";
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Brute-force protection: after this many wrong passwords the account is locked for a while.
const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS) || 5;
const LOCKOUT_MS = (Number(process.env.LOCKOUT_MINUTES) || 15) * 60 * 1000;

// Email verification / password reset
// While developing WITHOUT an email server (SMTP_HOST not set) no email can reach anybody, so requiring a
// verified address would lock every new account out. Verification is therefore only enforced in production
// or once SMTP is configured; set REQUIRE_EMAIL_VERIFICATION=false to switch it off everywhere.
const REQUIRE_EMAIL_VERIFICATION =
  process.env.REQUIRE_EMAIL_VERIFICATION !== "false" && (isProd || Boolean(process.env.SMTP_HOST));
const VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RESET_MINUTES = Number(process.env.PASSWORD_RESET_MINUTES) || 30;
const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per address per minute (stops email bombing)

// Compared against when the email is unknown, so "no such account" and "wrong password"
// take the same time and can't be told apart by measuring the response.
const DUMMY_HASH = bcrypt.hashSync(`dummy-${crypto.randomBytes(12).toString("hex")}`, 12);

// Cookie settings. Set COOKIE_SAMESITE=lax|strict in .env if the front end and the API are on the
// same site in production (stricter than the cross-site default of "none").
const sameSite = (process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax")).toLowerCase();
const baseCookie = {
  httpOnly: true, // JavaScript on the page can never read the session cookie
  secure: isProd || sameSite === "none", // only send over HTTPS in production
  sameSite,
  path: "/",
};

// The JWT is sent ONLY as an httpOnly cookie. It is deliberately not returned in the JSON body,
// so it can't be copied into localStorage (where any XSS bug could steal it).
const sendTokenResponse = (user, rememberMe, statusCode, res) => {
  const token = generateToken(user._id, rememberMe, user.tokenVersion ?? 0);

  const maxAgeMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie("token", token, { ...baseCookie, maxAge: maxAgeMs });

  // remember when the user was last here (admin "Last active"); a failure here must never block the login
  User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

  res.status(statusCode).json({
    success: true,
    user: user.toSafeObject(),
  });
};

const clearSessionCookie = (res) => res.clearCookie("token", baseCookie);

// Limits for the Account page (they mirror the User model)
const LANGUAGES = ["English", "Sinhala", "Tamil"];
const QUIZ_SIZES = [5, 10, 15, 20];
const MAX_PHOTO_CHARS = 90000;
const PHOTO_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const bad = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

// Runs slow work (sending email) AFTER the response, so how long a request takes never reveals
// whether an account exists. Failures are logged and never reach the client.
const background = (promise) => {
  Promise.resolve(promise).catch((err) => console.error("[auth] background task failed:", err.message));
};

// "You already have an account" notices: at most one per address every 10 minutes, so the
// sign-up form can't be used to flood somebody's inbox.
const NOTICE_COOLDOWN_MS = 10 * 60 * 1000;
const noticeSentAt = new Map();
const canSendNotice = (key) => {
  const now = Date.now();
  if (now - (noticeSentAt.get(key) || 0) < NOTICE_COOLDOWN_MS) return false;
  noticeSentAt.set(key, now);
  if (noticeSentAt.size > 5000) {
    for (const [k, t] of noticeSentAt) if (now - t > NOTICE_COOLDOWN_MS) noticeSentAt.delete(k);
  }
  return true;
};

/* ------------------------------------------------------------------ */
/* One-time email tokens                                               */
/* ------------------------------------------------------------------ */
async function issueEmailVerification(userId) {
  const user = await User.findById(userId).select("+emailVerifySentAt");
  if (!user || user.provider !== "local" || user.emailVerified) return;
  if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() < RESEND_COOLDOWN_MS) return;

  const { token, hash } = createToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerifyTokenHash: hash,
        emailVerifyExpires: new Date(Date.now() + VERIFY_EXPIRY_MS),
        emailVerifySentAt: new Date(),
      },
    }
  );
  await sendVerificationEmail(user, token);
}

async function issuePasswordReset(userId) {
  const user = await User.findById(userId).select("+passwordResetSentAt");
  if (!user || user.provider !== "local") return;
  if (user.passwordResetSentAt && Date.now() - user.passwordResetSentAt.getTime() < RESEND_COOLDOWN_MS) return;

  const { token, hash } = createToken();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hash, // a new request replaces (invalidates) any earlier link
        passwordResetExpires: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
        passwordResetSentAt: new Date(),
      },
    }
  );
  await sendPasswordResetEmail(user, token, RESET_MINUTES);
}

/* ------------------------------------------------------------------ */
/* Register / login                                                    */
/* ------------------------------------------------------------------ */

// @route  POST /api/auth/register
export const registerUser = async (req, res, next) => {
  try {
    const fullName = asString(req.body?.fullName).trim();
    const email = asString(req.body?.email).trim().toLowerCase();
    const { password, confirmPassword, acceptedTerms } = req.body || {};

    if (!fullName || !email || typeof password !== "string" || typeof confirmPassword !== "string" || !password || !confirmPassword) {
      return bad(res, 400, "All fields are required");
    }

    if (!isValidEmail(email)) {
      return bad(res, 400, "Please provide a valid email address");
    }

    if (fullName.length < 2 || fullName.length > 100) {
      return bad(res, 400, "Name must be between 2 and 100 characters");
    }

    if (password !== confirmPassword) {
      return bad(res, 400, "Passwords do not match");
    }

    const passwordError = validatePassword(password, { email });
    if (passwordError) {
      return bad(res, 400, passwordError);
    }

    if (acceptedTerms !== true) {
      return bad(res, 400, "You must accept the terms and privacy notice");
    }

    const existingUser = await User.findOne({ email });

    if (REQUIRE_EMAIL_VERIFICATION) {
      // The response is IDENTICAL whether or not the address already has an account, so this form
      // can't be used to discover who is registered. Existing owners get an email instead.
      const pending = () =>
        res.status(201).json({
          success: true,
          needsVerification: true,
          message: "Almost done! Check your email for a link to verify your address, then sign in.",
        });

      if (existingUser) {
        await bcrypt.hash(password, 12); // same work as creating an account, so the timing matches
        securityLog("register_existing_email", req, { userId: String(existingUser._id) });
        background(canSendNotice(email) ? sendAlreadyRegisteredEmail(existingUser) : null);
        return pending();
      }

      const user = await User.create({ fullName, email, password, acceptedTerms: true, provider: "local" });
      securityLog("register", req, { userId: String(user._id) });
      background(issueEmailVerification(user._id));
      return pending();
    }

    // Verification switched off (REQUIRE_EMAIL_VERIFICATION=false): sign in straight away.
    if (existingUser) {
      return bad(res, 409, "An account with this email already exists");
    }
    const user = await User.create({ fullName, email, password, acceptedTerms: true, provider: "local" });
    securityLog("register", req, { userId: String(user._id) });
    sendTokenResponse(user, false, 201, res);
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/auth/login
export const loginUser = async (req, res, next) => {
  try {
    const email = asString(req.body?.email).trim().toLowerCase();
    const password = req.body?.password;
    const rememberMe = req.body?.rememberMe;

    if (!email || typeof password !== "string" || !password || password.length > 256) {
      return bad(res, 400, "Email and password are required");
    }

    const user = await User.findOne({ email }).select("+password +failedLoginAttempts +lockUntil");

    if (!user || user.provider !== "local" || !user.password) {
      await bcrypt.compare(password, DUMMY_HASH); // keep the response time similar
      securityLog("login_failed", req, { reason: "unknown_account", email: hashEmail(email) });
      return bad(res, 401, "Invalid email or password");
    }

    // Temporarily locked after too many wrong passwords
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      securityLog("login_blocked_locked", req, { userId: String(user._id) });
      return bad(res, 429, `Too many failed attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const updated = await User.findOneAndUpdate(
        { _id: user._id },
        { $inc: { failedLoginAttempts: 1 } },
        { new: true }
      ).select("+failedLoginAttempts");

      if (updated && updated.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        await User.updateOne(
          { _id: user._id },
          { $set: { lockUntil: new Date(Date.now() + LOCKOUT_MS), failedLoginAttempts: 0 } }
        );
        securityLog("account_locked", req, { userId: String(user._id) });
      }

      securityLog("login_failed", req, { reason: "bad_password", userId: String(user._id) });
      return bad(res, 401, "Invalid email or password");
    }

    // Checked only AFTER the password is correct, so the response never reveals the status of other people's accounts.
    if (user.status !== "active") {
      securityLog("login_blocked_inactive", req, { userId: String(user._id) });
      return bad(res, 403, "This account has been deactivated. Please contact support.");
    }

    if (REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      securityLog("login_blocked_unverified", req, { userId: String(user._id) });
      background(issueEmailVerification(user._id)); // sends a fresh link (at most once a minute)
      return bad(
        res,
        403,
        "Please verify your email address before signing in. Check your inbox (and spam folder) for the link, or request a new one.",
        { code: "EMAIL_NOT_VERIFIED" }
      );
    }

    if (user.failedLoginAttempts || user.lockUntil) {
      await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null } });
    }
    if (!REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } }); // nothing to verify against
    }

    securityLog("login_success", req, { userId: String(user._id), method: "password" });
    sendTokenResponse(user, Boolean(rememberMe), 200, res);
  } catch (err) {
    next(err);
  }
};

/* ------------------------------------------------------------------ */
/* Email verification                                                  */
/* ------------------------------------------------------------------ */

// @route  POST /api/auth/verify-email   body: { token }
// POST (not GET) so mail scanners that "click" links in emails can't use up the token.
export const verifyEmail = async (req, res, next) => {
  try {
    const token = req.body?.token;
    const invalid = () =>
      bad(res, 400, "This verification link is invalid or has expired. Sign in to receive a new one.");

    if (!isTokenFormat(token)) return invalid();

    // One atomic step: find a matching, unexpired token AND consume it, so it can only be used once.
    const user = await User.findOneAndUpdate(
      { emailVerifyTokenHash: hashToken(token), emailVerifyExpires: { $gt: new Date() } },
      { $set: { emailVerified: true }, $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1 } },
      { new: true }
    );

    if (!user) {
      securityLog("email_verification_failed", req);
      return invalid();
    }

    securityLog("email_verified", req, { userId: String(user._id) });
    res.status(200).json({ success: true, message: "Your email address is verified. You can now sign in." });
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/auth/resend-verification   body: { email }
// Same answer whether or not the address exists (no account enumeration).
export const resendVerification = async (req, res, next) => {
  try {
    const email = asString(req.body?.email).trim().toLowerCase();
    if (!isValidEmail(email)) return bad(res, 400, "Please provide a valid email address");

    background(
      (async () => {
        const user = await User.findOne({ email, provider: "local", emailVerified: false }).select("_id");
        if (user) await issueEmailVerification(user._id);
      })()
    );

    res.status(200).json({
      success: true,
      message: "If that address has an unverified account, we've sent a new verification link.",
    });
  } catch (err) {
    next(err);
  }
};

/* ------------------------------------------------------------------ */
/* Forgot / reset password                                             */
/* ------------------------------------------------------------------ */

// @route  POST /api/auth/forgot-password   body: { email }
export const forgotPassword = async (req, res, next) => {
  try {
    const email = asString(req.body?.email).trim().toLowerCase();
    if (!isValidEmail(email)) return bad(res, 400, "Please provide a valid email address");

    securityLog("password_reset_requested", req, { email: hashEmail(email) });

    background(
      (async () => {
        const user = await User.findOne({ email, provider: "local" }).select("_id");
        if (user) await issuePasswordReset(user._id);
      })()
    );

    // Identical answer for every address: the form can't be used to find out who has an account.
    res.status(200).json({
      success: true,
      message: "If an account exists for that email, we've sent password reset instructions.",
    });
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/auth/reset-password   body: { token, password }
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const invalid = () => bad(res, 400, "This reset link is invalid or has expired. Please request a new one.");

    if (!isTokenFormat(token)) return invalid();

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select("email fullName");

    if (!user) {
      securityLog("password_reset_failed", req, { reason: "bad_or_expired_token" });
      return invalid();
    }

    // The new password is checked BEFORE the link is used up, so a weak password can simply be corrected.
    const passwordError = validatePassword(password, { email: user.email });
    if (passwordError) return bad(res, 400, passwordError);

    const hashed = await bcrypt.hash(password, 12);

    // Atomic: consumes the link and sets the password in one step (a second use finds nothing).
    const updated = await User.findOneAndUpdate(
      { _id: user._id, passwordResetTokenHash: tokenHash, passwordResetExpires: { $gt: new Date() } },
      {
        $set: { password: hashed, emailVerified: true, failedLoginAttempts: 0, lockUntil: null },
        $inc: { tokenVersion: 1 }, // signs the account out everywhere (a stolen session dies here)
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpires: 1,
          emailVerifyTokenHash: 1,
          emailVerifyExpires: 1,
        },
      },
      { new: true }
    );

    if (!updated) return invalid();

    securityLog("password_reset_completed", req, { userId: String(updated._id) });
    background(sendPasswordChangedEmail(updated));

    res.status(200).json({ success: true, message: "Your password has been updated. You can now sign in." });
  } catch (err) {
    next(err);
  }
};

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */

// @route  POST /api/auth/google
// body: { credential }  <- the ID token string from Google's Sign In With Google button
export const googleAuth = async (req, res, next) => {
  try {
    const credential = req.body?.credential;

    if (typeof credential !== "string" || !credential || credential.length > 4096) {
      return bad(res, 400, "Missing Google credential");
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error("[google-auth] GOOGLE_CLIENT_ID is not set in the backend .env");
      return bad(res, 500, "Google sign-in is not configured on the server");
    }

    // Fail fast with a clear message instead of letting the query hang for 10s
    // and surface as a generic "Server error".
    if (mongoose.connection.readyState !== 1) {
      console.error("[google-auth] MongoDB is not connected (readyState =", mongoose.connection.readyState, ")");
      return bad(res, 503, "The server cannot reach the database right now. Please try again shortly.");
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error("[google-auth] token verification failed:", verifyErr.message);
      securityLog("google_login_failed", req, { reason: "invalid_token" });
      return bad(res, 401, "Invalid Google credential");
    }

    if (!payload?.email) {
      return bad(res, 401, "Google account has no email");
    }

    // Google only guarantees the email is safe to trust for sign-in if verified
    if (!payload.email_verified) {
      return bad(res, 401, "Google email is not verified");
    }

    let user = await User.findOne({ email: payload.email.toLowerCase() });

    if (user) {
      if (user.status !== "active") {
        securityLog("login_blocked_inactive", req, { userId: String(user._id), method: "google" });
        return bad(res, 403, "This account has been deactivated. Please contact support.");
      }

      // The account is already tied to a DIFFERENT Google identity (e.g. the email address was recycled).
      if (user.googleId && user.googleId !== payload.sub) {
        securityLog("google_login_failed", req, { reason: "google_id_mismatch", userId: String(user._id) });
        return bad(res, 401, "This email is linked to a different Google account");
      }

      // Existing local (password) account signing in with Google for the first time:
      // link the Google id rather than creating a duplicate account.
      if (user.provider === "local" && !user.googleId) {
        if (!user.emailVerified) {
          // Nobody ever confirmed this address, so whoever created the account may not own it
          // (someone could have pre-registered a victim's email with a password they know).
          // Google has now proven ownership, so remove that password and end all old sessions.
          await User.updateOne(
            { _id: user._id },
            {
              $set: { googleId: payload.sub, emailVerified: true },
              $unset: {
                password: 1,
                emailVerifyTokenHash: 1,
                emailVerifyExpires: 1,
                passwordResetTokenHash: 1,
                passwordResetExpires: 1,
              },
              $inc: { tokenVersion: 1 },
            }
          );
          user = await User.findById(user._id);
          securityLog("google_link_unverified_account_secured", req, { userId: String(user._id) });
        } else {
          user.googleId = payload.sub;
          await user.save();
          securityLog("google_account_linked", req, { userId: String(user._id) });
        }
      }
    } else {
      user = await User.create({
        fullName: (payload.name || payload.email.split("@")[0]).slice(0, 100),
        email: payload.email,
        provider: "google",
        googleId: payload.sub,
        emailVerified: true, // Google already verified it
        acceptedTerms: true, // implicit: Google sign-in only offered alongside your terms notice
      });
      securityLog("register", req, { userId: String(user._id), method: "google" });
    }

    securityLog("login_success", req, { userId: String(user._id), method: "google" });
    sendTokenResponse(user, true, 200, res); // Google sign-in defaults to a longer-lived session
  } catch (err) {
    next(err);
  }
};

/* ------------------------------------------------------------------ */
/* Session / account                                                   */
/* ------------------------------------------------------------------ */

// @route  POST /api/auth/logout
export const logoutUser = (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ success: true, message: "Logged out" });
};

// @route  POST /api/auth/logout-all  (protected)
// "Sign out everywhere": every login token issued so far (all devices) stops working immediately.
export const logoutAllDevices = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 } });
    securityLog("logout_all_devices", req, { userId: String(req.userId) });
    background(
      notifyUser(req.userId, {
        type: "security",
        title: "Signed out on all devices",
        message: "Every active session was ended. Sign in again to continue.",
      })
    );
    clearSessionCookie(res);
    res.status(200).json({ success: true, message: "Signed out on all devices" });
  } catch (err) {
    next(err);
  }
};

// @route  GET /api/auth/me  (protected)
export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return bad(res, 404, "User not found");
    }
    res.status(200).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @route  PATCH /api/auth/profile  (protected)
// body: any of { fullName, programme, preferredLanguage, photoUrl }  (photoUrl "" removes the photo)
// The email address is deliberately NOT editable here: changing it would skip email verification.
export const updateProfile = async (req, res, next) => {
  try {
    const body = req.body || {};
    const set = {};

    if (body.fullName !== undefined) {
      const fullName = asString(body.fullName).trim();
      if (fullName.length < 2 || fullName.length > 100) {
        return bad(res, 400, "Name must be between 2 and 100 characters");
      }
      set.fullName = fullName;
    }

    if (body.programme !== undefined) {
      const programme = asString(body.programme).trim();
      if (programme.length > 100) return bad(res, 400, "Course or programme must be 100 characters or fewer");
      set.programme = programme;
    }

    if (body.preferredLanguage !== undefined) {
      if (!LANGUAGES.includes(body.preferredLanguage)) return bad(res, 400, "Choose English, Sinhala or Tamil");
      set.preferredLanguage = body.preferredLanguage;
    }

    if (body.photoUrl !== undefined) {
      const photoUrl = asString(body.photoUrl);
      if (photoUrl && (photoUrl.length > MAX_PHOTO_CHARS || !PHOTO_PATTERN.test(photoUrl))) {
        return bad(res, 400, "The profile photo must be a small PNG, JPEG or WebP image");
      }
      set.photoUrl = photoUrl;
    }

    if (!Object.keys(set).length) return bad(res, 400, "Nothing to update");

    const user = await User.findByIdAndUpdate(req.userId, { $set: set }, { new: true, runValidators: true });
    if (!user) return bad(res, 404, "User not found");

    securityLog("profile_updated", req, { userId: String(user._id), fields: Object.keys(set) });
    res.status(200).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @route  PATCH /api/auth/preferences  (protected)
// body: any of { quizSize, outputs: {notes, quiz, tutorial}, notifications: {ready, failed, weekly} }
// Only the keys that are sent are changed, so each notification switch can save on its own.
export const updatePreferences = async (req, res, next) => {
  try {
    const { quizSize, outputs, notifications } = req.body || {};
    const set = {};

    if (quizSize !== undefined) {
      if (!QUIZ_SIZES.includes(quizSize)) return bad(res, 400, "Quiz size must be 5, 10, 15 or 20");
      set["preferences.quizSize"] = quizSize;
    }

    const addFlags = (group, value, allowedKeys) => {
      if (value === undefined) return null;
      if (!value || typeof value !== "object" || Array.isArray(value)) return `Invalid ${group} settings`;
      for (const key of Object.keys(value)) {
        if (!allowedKeys.includes(key) || typeof value[key] !== "boolean") return `Invalid ${group} setting: ${key}`;
        set[`preferences.${group}.${key}`] = value[key];
      }
      return null;
    };
    const problem =
      addFlags("outputs", outputs, ["notes", "quiz", "tutorial"]) ||
      addFlags("notifications", notifications, ["ready", "failed", "weekly"]);
    if (problem) return bad(res, 400, problem);

    if (!Object.keys(set).length) return bad(res, 400, "Nothing to update");

    // At least one output must stay switched on, otherwise the Upload page would have nothing to generate.
    if (outputs !== undefined) {
      const current = await User.findById(req.userId).select("preferences").lean();
      if (!current) return bad(res, 404, "User not found");
      const merged = {
        notes: current.preferences?.outputs?.notes ?? true,
        quiz: current.preferences?.outputs?.quiz ?? true,
        tutorial: current.preferences?.outputs?.tutorial ?? true,
        ...outputs,
      };
      if (!merged.notes && !merged.quiz && !merged.tutorial) {
        return bad(res, 400, "Select at least one default output");
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, { $set: set }, { new: true, runValidators: true });
    if (!user) return bad(res, 404, "User not found");

    res.status(200).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// @route  PATCH /api/auth/password  (protected)
// body: { currentPassword, newPassword }
// Changing the password signs the account out on every other device.
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      return bad(res, 400, "Current password and new password are required");
    }

    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return bad(res, 404, "User not found");
    }

    if (!user.password) {
      return bad(res, 400, "This account signs in with Google and has no password to change");
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      securityLog("password_change_failed", req, { userId: String(user._id) });
      return bad(res, 401, "Current password is incorrect");
    }

    if (newPassword === currentPassword) {
      return bad(res, 400, "The new password must be different from the current one");
    }

    const passwordError = validatePassword(newPassword, { email: user.email });
    if (passwordError) {
      return bad(res, 400, passwordError);
    }

    user.password = newPassword; // hashed by the model's pre-save hook
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // signs out every other device
    await user.save();

    securityLog("password_changed", req, { userId: String(user._id) });
    background(sendPasswordChangedEmail(user)); // tells the owner, in case it was not them
    background(
      notifyUser(user._id, {
        type: "security",
        title: "Your password was changed",
        message: "You were signed out on your other devices. If this was not you, reset your password right away.",
      })
    );
    sendTokenResponse(user, false, 200, res); // fresh session for this device
  } catch (err) {
    next(err);
  }
};

// @route  GET /api/auth/export  (protected)
// Privacy: lets users download a copy of all the data DocuMind holds about them.
export const exportMyData = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return bad(res, 404, "User not found");
    }

    const [lectures, quizzes, quizAttempts, notifications] = await Promise.all([
      Lecture.find({ user: user._id }).select("-filePath").lean(), // never expose server file paths
      Quiz.find({ user: user._id }).lean(),
      QuizAttempt.find({ user: user._id }).lean(),
      Notification.find({ user: user._id }).sort({ createdAt: -1 }).lean(),
    ]);

    securityLog("data_export", req, { userId: String(user._id) });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="documind-data-export.json"');
    res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          account: user.toSafeObject(),
          lectures,
          quizzes,
          quizAttempts,
          notifications,
        },
        null,
        2
      )
    );
  } catch (err) {
    next(err);
  }
};

// @route  DELETE /api/auth/delete  (protected)
// body: { password }  <- required for accounts that sign in with a password
// Permanently removes the user's account from the database.
export const deleteAccount = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return bad(res, 404, "User not found");
    }

    // Password-based accounts must re-enter their password before anything is
    // destroyed, so a stolen or left-open session can't wipe the account by itself.
    // (Google-only accounts have no password, so their valid session is the proof.)
    if (user.password) {
      const { password } = req.body || {};
      if (typeof password !== "string" || !password) {
        return bad(res, 400, "Password is required to delete your account");
      }
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        securityLog("account_delete_failed", req, { userId: String(user._id) });
        return bad(res, 401, "Incorrect password");
      }
    }

    // Delete everything that belongs to this user BEFORE removing the user: uploaded files that are still
    // on disk, lectures, quizzes, quiz attempts, notifications, generated code and diagrams.
    await deleteUserData(user._id);

    await User.deleteOne({ _id: user._id });
    securityLog("account_deleted", req, { userId: String(user._id) });

    // Log the browser out too
    clearSessionCookie(res);

    res.status(200).json({ success: true, message: "Account permanently deleted" });
  } catch (err) {
    next(err);
  }
};

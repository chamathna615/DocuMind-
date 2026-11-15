/**
 * Email delivery (verification, password reset, security notices).
 *
 * Production:  set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM in .env and run
 *              `npm install nodemailer`.
 * Development: when SMTP_HOST is not set, emails are printed to the backend terminal instead of
 *              being sent (so you can click the verification / reset link while testing).
 *              This console fallback is DISABLED when NODE_ENV=production.
 */

const isProd = () => process.env.NODE_ENV === "production";

export const isEmailConfigured = () => Boolean(process.env.SMTP_HOST);

// Where the links in the emails point to. Always comes from configuration, never from request
// headers, so an attacker can't make us send reset links to their own domain (host-header injection).
export const appUrl = () =>
  (process.env.CLIENT_URL || (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",")[0])
    .trim()
    .replace(/\/+$/, "");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let transporterPromise = null;
const getTransporter = () => {
  if (!isEmailConfigured()) return Promise.resolve(null);
  if (!transporterPromise) {
    transporterPromise = import("nodemailer")
      .then(({ default: nodemailer }) =>
        nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: String(process.env.SMTP_SECURE).toLowerCase() === "true", // true = port 465
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      )
      .catch(() => {
        console.error("[email] SMTP_HOST is set but the 'nodemailer' package is not installed. Run: npm install nodemailer");
        return null;
      });
  }
  return transporterPromise;
};

async function sendEmail({ to, subject, text, html }) {
  const transporter = await getTransporter();

  if (transporter) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return;
  }

  if (isEmailConfigured()) throw new Error("Email could not be sent: nodemailer is not installed");
  if (isProd()) throw new Error("Email could not be sent: SMTP is not configured");

  // Development only: show the email in the terminal.
  console.log(`\n[email: DEV ONLY - not really sent]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
}

const layout = (heading, bodyHtml) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 16px;color:#102a56">${escapeHtml(heading)}</h2>
    ${bodyHtml}
    <p style="margin-top:28px;font-size:12px;color:#64748b">DocuMind &middot; This is an automated message, please do not reply.</p>
  </div>
</body></html>`;

const button = (href, label) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#102a56;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(label)}</a></p>
   <p style="font-size:13px;color:#475569">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(href)}</span></p>`;

export function sendVerificationEmail(user, token) {
  const link = `${appUrl()}/verify-email?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Verify your DocuMind email address",
    text: `Hi ${user.fullName},\n\nConfirm your email address to finish creating your DocuMind account:\n${link}\n\nThis link works once and expires in 24 hours. If you did not create an account, you can ignore this email.`,
    html: layout(
      "Verify your email address",
      `<p>Hi ${escapeHtml(user.fullName)},</p><p>Confirm your email address to finish creating your DocuMind account.</p>${button(link, "Verify my email")}<p style="font-size:13px;color:#475569">This link works once and expires in 24 hours. If you did not create an account, you can ignore this email.</p>`
    ),
  });
}

export function sendPasswordResetEmail(user, token, minutes) {
  const link = `${appUrl()}/reset-password?token=${token}`;
  return sendEmail({
    to: user.email,
    subject: "Reset your DocuMind password",
    text: `Hi ${user.fullName},\n\nWe received a request to reset your DocuMind password. Choose a new one here:\n${link}\n\nThis link works once and expires in ${minutes} minutes. If you did not ask for this, ignore this email: your password will not change.`,
    html: layout(
      "Reset your password",
      `<p>Hi ${escapeHtml(user.fullName)},</p><p>We received a request to reset your DocuMind password.</p>${button(link, "Choose a new password")}<p style="font-size:13px;color:#475569">This link works once and expires in ${minutes} minutes. If you did not ask for this, ignore this email: your password will not change.</p>`
    ),
  });
}

export function sendPasswordChangedEmail(user) {
  const link = `${appUrl()}/forgot-password`;
  return sendEmail({
    to: user.email,
    subject: "Your DocuMind password was changed",
    text: `Hi ${user.fullName},\n\nThe password of your DocuMind account was just changed, and you were signed out on your other devices.\n\nIf this was you, no action is needed. If it was not you, reset your password immediately:\n${link}`,
    html: layout(
      "Your password was changed",
      `<p>Hi ${escapeHtml(user.fullName)},</p><p>The password of your DocuMind account was just changed and you were signed out on your other devices.</p><p>If this was you, no action is needed. <strong>If it was not you</strong>, reset your password immediately.</p>${button(link, "Reset my password")}`
    ),
  });
}

// Sent instead of a "this email is taken" error, so the sign-up form can't be used to find out
// which email addresses have an account.
export function sendAlreadyRegisteredEmail(user) {
  const loginLink = `${appUrl()}/login`;
  const resetLink = `${appUrl()}/forgot-password`;
  return sendEmail({
    to: user.email,
    subject: "You already have a DocuMind account",
    text: `Hi ${user.fullName},\n\nSomeone (hopefully you) tried to create a DocuMind account with this email address, but you already have one.\n\nSign in: ${loginLink}\nForgot your password? ${resetLink}\n\nIf this was not you, you can safely ignore this email.`,
    html: layout(
      "You already have an account",
      `<p>Hi ${escapeHtml(user.fullName)},</p><p>Someone (hopefully you) tried to create a DocuMind account with this email address, but you already have one.</p>${button(loginLink, "Sign in")}<p style="font-size:13px;color:#475569">Forgot your password? <a href="${escapeHtml(resetLink)}">Reset it here</a>. If this was not you, you can safely ignore this email.</p>`
    ),
  });
}

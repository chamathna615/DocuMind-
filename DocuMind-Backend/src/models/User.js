import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
     role: {
     type: String,
     enum: ["student", "admin"],
     default: "student",
},

     status: {
     type: String,
     enum: ["active", "inactive"],
    default: "active",
    },
    // Not required so Google-authenticated accounts can exist without a password
    password: {
      type: String,
      minlength: 8,
      select: false, // never returned by default in queries
    },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    googleId: {
      type: String,
      default: null,
    },
    // --- profile (Account page) ---
    programme: { type: String, trim: true, maxlength: 100, default: "" },
    preferredLanguage: { type: String, enum: ["English", "Sinhala", "Tamil"], default: "English" },
    // Small square picture stored as a data URL (the Account page shrinks it to 256x256 first)
    photoUrl: { type: String, default: "", maxlength: 90000 },
    // --- preferences (Account page): used as the defaults on the Upload and Write-a-prompt pages ---
    preferences: {
      quizSize: { type: Number, enum: [5, 10, 15, 20], default: 10 },
      outputs: {
        notes: { type: Boolean, default: true },
        quiz: { type: Boolean, default: true },
        tutorial: { type: Boolean, default: true },
      },
      // Which in-app notifications the student wants (see notificationService.js)
      notifications: {
        ready: { type: Boolean, default: true },
        failed: { type: Boolean, default: true },
        weekly: { type: Boolean, default: false },
      },
    },
    // When the last weekly summary was created (at most one per 7 days)
    lastWeeklySummaryAt: { type: Date, default: null, select: false },
    // --- security ---
    // When the user last signed in (shown as "Last active" on the admin Users page).
    lastLoginAt: { type: Date, default: null },
    // Brute-force protection: consecutive failed password logins, and a temporary lock.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    // Bumped on password change / "sign out everywhere": every older login token stops working.
    tokenVersion: { type: Number, default: 0 },
    // --- email verification ---
    // Accounts that existed before this feature are marked verified once at startup (see maintenance.js).
    emailVerified: { type: Boolean, default: false },
    // Only the SHA-256 HASH of each one-time token is stored; the real token is only in the email.
    emailVerifyTokenHash: { type: String, select: false, index: true },
    emailVerifyExpires: { type: Date, select: false },
    emailVerifySentAt: { type: Date, select: false },
    // --- password reset ---
    passwordResetTokenHash: { type: String, select: false, index: true },
    passwordResetExpires: { type: Date, select: false },
    passwordResetSentAt: { type: Date, select: false },
    acceptedTerms: {
      type: Boolean,
      required: true,
      validate: {
        validator: (v) => v === true,
        message: "You must accept the terms and privacy notice",
      },
    },
  },
  { timestamps: true }
);

// Hash password before saving, only if it was modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    fullName: this.fullName,
    email: this.email,
    provider: this.provider,
    role: this.role,
    status: this.status,
    emailVerified: this.emailVerified,
    createdAt: this.createdAt,
    programme: this.programme || "",
    preferredLanguage: this.preferredLanguage || "English",
    photoUrl: this.photoUrl || "",
    preferences: {
      quizSize: this.preferences?.quizSize ?? 10,
      outputs: {
        notes: this.preferences?.outputs?.notes ?? true,
        quiz: this.preferences?.outputs?.quiz ?? true,
        tutorial: this.preferences?.outputs?.tutorial ?? true,
      },
      notifications: {
        ready: this.preferences?.notifications?.ready ?? true,
        failed: this.preferences?.notifications?.failed ?? true,
        weekly: this.preferences?.notifications?.weekly ?? false,
      },
    },
  };
};

export default mongoose.model("User", userSchema);

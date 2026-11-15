import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerUser,
  loginUser,
  googleAuth,
  logoutUser,
  logoutAllDevices,
  getCurrentUser,
  changePassword,
  updateProfile,
  updatePreferences,
  exportMyData,
  deleteAccount,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// Limit brute-force attempts on auth endpoints
// (each account is additionally locked after repeated wrong passwords, see loginUser)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 20 : 200, // relaxed while developing, so testing is not blocked
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again later" },
});

// Endpoints that SEND EMAIL are limited more strictly (plus a per-address cooldown in the controller).
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email requests, please try again later" },
});

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/google", authLimiter, googleAuth);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", emailLimiter, resendVerification);
router.post("/forgot-password", emailLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/logout", logoutUser);
router.post("/logout-all", protect, logoutAllDevices);
router.get("/me", protect, getCurrentUser);
router.patch("/profile", protect, updateProfile);
router.patch("/preferences", protect, updatePreferences);
router.get("/export", protect, exportMyData);
// authLimiter also stops password brute-forcing through these endpoints
router.patch("/password", protect, authLimiter, changePassword);
router.delete("/delete", protect, authLimiter, deleteAccount);

export default router;

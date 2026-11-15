import express from "express";
import protect from "../middleware/authMiddleware.js";
import { heavyLimiter } from "../middleware/securityMiddleware.js";
import {
  createCode,
  listCode,
  getCode,
  cancelCode,
  retryCode,
  deleteCode,
} from "../controllers/codeController.js";

const router = express.Router();

// heavyLimiter = per-user hourly cap on actions that cost money (AI generation).
// It runs after `protect` (needs the user id).
router.route("/").post(protect, heavyLimiter, createCode).get(protect, listCode);

router.route("/:id").get(protect, getCode).delete(protect, deleteCode);

router.post("/:id/cancel", protect, cancelCode);
router.post("/:id/retry", protect, heavyLimiter, retryCode);

export default router;

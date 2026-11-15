import express from "express";
import protect from "../middleware/authMiddleware.js";
import upload, { verifyUploadContent } from "../middleware/uploadMiddleware.js";
import { heavyLimiter } from "../middleware/securityMiddleware.js";
import {
  createLecture,
  createPromptLecture,
  getLectures,
  getLecture,
  searchLectures,
  updateLecture,
  deleteLecture,
  cancelLecture,
  retryLecture,
  regenerateLecture,
  downloadLecture,
} from "../controllers/lectureController.js";

const router = express.Router();

// heavyLimiter = per-user hourly cap on actions that cost money (uploads / AI generation).
// It runs after `protect` (needs the user id) and before the upload is written to disk.
router
  .route("/")
  .post(protect, heavyLimiter, upload.single("file"), verifyUploadContent, createLecture)
  .get(protect, getLectures);

router.post("/prompt", protect, heavyLimiter, createPromptLecture);
// must stay above "/:id", otherwise "search" would be read as a lecture id
router.get("/search", protect, searchLectures);

router
  .route("/:id")
  .get(protect, getLecture)
  .patch(protect, updateLecture)
  .delete(protect, deleteLecture);

router.post("/:id/cancel", protect, cancelLecture);
router.post("/:id/retry", protect, heavyLimiter, retryLecture);
router.post("/:id/regenerate", protect, heavyLimiter, regenerateLecture);
router.get("/:id/download/:kind", protect, downloadLecture);

export default router;

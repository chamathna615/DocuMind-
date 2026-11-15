import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  getQuiz,
  submitQuizAttempt,
  getLatestQuizAttempt,
} from "../controllers/quizController.js";

const router = express.Router();

router.get("/lectures/:lectureId/quiz", protect, getQuiz);
router.post("/lectures/:lectureId/quiz-attempts", protect, submitQuizAttempt);
router.get(
  "/lectures/:lectureId/quiz-attempts/latest",
  protect,
  getLatestQuizAttempt
);

export default router;
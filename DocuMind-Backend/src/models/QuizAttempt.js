import mongoose from "mongoose";

const quizAttemptSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
    },
    lecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    answers: {
      type: Map,
      of: String,
      default: {},
    },
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    results: [
      {
        questionId: String,
        prompt: String,
        givenAnswer: String,
        expectedAnswer: String,
        correct: Boolean,
        explanation: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("QuizAttempt", quizAttemptSchema);
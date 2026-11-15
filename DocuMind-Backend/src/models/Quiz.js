import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["mcq", "short"],
    required: true,
  },
  prompt: { type: String, required: true },
  options: [String],
  answer: { type: String, required: true }, // kept on backend
  keywords: [String],
  explanation: { type: String, required: true },
});

const quizSchema = new mongoose.Schema(
  {
    lecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    questions: [questionSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Quiz", quizSchema);
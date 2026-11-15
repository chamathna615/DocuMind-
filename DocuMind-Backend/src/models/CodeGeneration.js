import mongoose from "mongoose";

// One "Generate code" request: the student's prompt, the options they chose and the answer
// (Markdown: overview, code, explanation, example, tests) written by the language model.
const codeGenerationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    // What the student asked for
    prompt: { type: String, required: true },
    // "auto" = the model chooses the most suitable programming language
    programmingLanguage: { type: String, default: "auto" },
    // Language of the explanation. Code and code comments are always written in English.
    language: { type: String, enum: ["English", "Sinhala", "Tamil"], default: "English" },
    // The code itself is always produced; these are the extra parts the student switched on.
    options: {
      explanation: { type: Boolean, default: true },
      example: { type: Boolean, default: true },
      tests: { type: Boolean, default: false },
    },

    // ---- processing state (the page polls these) ----
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
    },
    // stage: queued | validating | writing | finalizing | completed | failed | cancelled
    stage: { type: String, default: "queued" },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    errorMessage: { type: String, default: "" },

    // Text written so far, while the model is still writing (cleared when the request is completed)
    preview: { type: String, default: "" },
    // The finished answer (Markdown)
    result: { type: String, default: "" },

    // ---- analytics ----
    processingStartedAt: { type: Date, default: null },
    processingCompletedAt: { type: Date, default: null },
    processingMs: { type: Number, default: 0 },
    usage: {
      llmInputTokens: { type: Number, default: 0 },
      llmOutputTokens: { type: Number, default: 0 },
      estimatedCostUsd: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

codeGenerationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("CodeGeneration", codeGenerationSchema);

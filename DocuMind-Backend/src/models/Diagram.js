import mongoose from "mongoose";

// One "Generate diagram" request: the student's prompt, the options they chose and the answer
// (Markdown: overview, one ```mermaid block, optional explanation) written by the language model.
// The page draws the diagram from the Mermaid code with mermaid.js.
const diagramSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    // What the student asked for
    prompt: { type: String, required: true },
    // "auto" = the model chooses the most suitable diagram type
    diagramType: { type: String, default: "auto" },
    // simple | standard | detailed  (how many elements the diagram has)
    detail: { type: String, enum: ["simple", "standard", "detailed"], default: "standard" },
    // Language of the labels and the explanation (Mermaid keywords stay English)
    language: { type: String, enum: ["English", "Sinhala", "Tamil"], default: "English" },
    options: {
      explanation: { type: Boolean, default: true },
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

diagramSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Diagram", diagramSchema);

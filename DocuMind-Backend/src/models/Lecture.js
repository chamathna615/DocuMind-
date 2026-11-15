import mongoose from "mongoose";

const lectureSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Empty after the file has been processed (the upload is deleted for privacy)
    filePath: { type: String, default: "" },
    title: { type: String, required: true, trim: true },
    course: { type: String, default: "General studies" },
    filename: { type: String, required: true },
    // TEXT = created from the "Write a prompt" page (no uploaded file)
    fileType: { type: String, enum: ["MP3", "MP4", "PDF", "TEXT"], required: true },
    // The student's own request when fileType is TEXT
    prompt: { type: String, default: "" },
    // Live preview of the text being written for a prompt (cleared when the lecture is completed)
    preview: { type: String, default: "" },
    fileSize: { type: Number, required: true },

    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed", "cancelled"],
      default: "uploaded",
    },

    // ---- what the student asked for (Upload page) ----
    outputs: {
      type: [{ type: String, enum: ["notes", "quiz", "tutorial"] }],
      default: ["notes", "quiz", "tutorial"],
    },
    language: { type: String, enum: ["English", "Sinhala", "Tamil"], default: "English" },
    questionCount: { type: Number, default: 10, min: 1, max: 30 },

    // ---- processing state (Processing page polls these) ----
    // stage: queued | validating | preparing | extracting | cleaning | segmenting | notes | quiz | tutorial | finalizing | completed | failed | cancelled
    stage: { type: String, default: "uploaded" },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    errorMessage: { type: String, default: "" },

    // ---- generated content ----
    notes: { type: String, default: "" }, // Markdown
    tutorial: { type: String, default: "" }, // Markdown (study guide)
    transcript: { type: String, default: "" }, // CLEANED transcript of audio/video, or cleaned text of the PDF
    rawTranscript: { type: String, default: "", select: false }, // what speech-to-text returned, before cleaning

    // Structured JSON produced by the LLM (the source of the notes / study guide Markdown):
    //   { summary: { overview, keyTakeaways[], sections[], glossary[] },
    //     studyGuide: { learningObjectives[], topics[], commonMistakes[], practiceQuestions[], revisionChecklist[] } }
    // (the quiz is stored in the Quiz collection)
    structured: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    // What the cleaning and segmentation steps did (for the admin analytics)
    pipelineStats: {
      segmentCount: { type: Number, default: 0 },
      cleaning: {
        fillersRemoved: { type: Number, default: 0 },
        repeatsRemoved: { type: Number, default: 0 },
        overlapWordsRemoved: { type: Number, default: 0 },
        headerFooterLinesRemoved: { type: Number, default: 0 },
        wordsBefore: { type: Number, default: 0 },
        wordsAfter: { type: Number, default: 0 },
        charsBefore: { type: Number, default: 0 },
        charsAfter: { type: Number, default: 0 },
      },
    },

    // ---- analytics ----
    durationSec: { type: Number, default: 0 }, // length of the recording
    wordCount: { type: Number, default: 0 },
    processingStartedAt: { type: Date, default: null },
    processingCompletedAt: { type: Date, default: null },
    processingMs: { type: Number, default: 0 }, // duration of the last successful run
    usage: {
      sttMinutes: { type: Number, default: 0 },
      llmInputTokens: { type: Number, default: 0 },
      llmOutputTokens: { type: Number, default: 0 },
      estimatedCostUsd: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

lectureSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Lecture", lectureSchema);

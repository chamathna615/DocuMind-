import fs from "node:fs";
import path from "node:path";
import Lecture from "../models/Lecture.js";
import Quiz from "../models/Quiz.js";
import { ai } from "../config/aiConfig.js";
import { UserError, CancelledError } from "../utils/userError.js";
import { getDurationSec, extractChunks } from "./mediaService.js";
import { transcribeChunks } from "./transcriptionService.js";
import { extractPdfText } from "./pdfTextService.js";
import { cleanTranscript, cleanDocumentText, countWords } from "./transcriptCleaner.js";
import { segmentText } from "./segmentationService.js";
import { generateNotes, generateTutorial, generateQuiz, generateSourceFromPrompt } from "./contentService.js";
import { notifyUser } from "./notificationService.js";

const clip = (value, max) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const MIN_TEXT_CHARS = 50;
const MIN_PDF_CHARS = 200;
const ALL_OUTPUTS = ["notes", "quiz", "tutorial"];

const absolute = (relativePath) => path.join(process.cwd(), relativePath);
const removeFile = (file) => fs.promises.rm(file, { force: true }).catch(() => {});

// Shown to the student when something goes wrong (the real error is only logged).
export function friendlyError(err) {
  if (err instanceof UserError) return err.userMessage;
  const status = err?.status;
  if (status === 401 || status === 403) return "The AI service is not configured correctly. Please contact support.";
  if (status === 429) return "The AI service is busy or has reached its usage limit. Please try again in a few minutes.";
  if (status >= 500) return "The AI service is temporarily unavailable. Please try again shortly.";
  if (/connection|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(`${err?.name} ${err?.message} ${err?.code}`)) {
    return "Could not reach the AI service. Please try again shortly.";
  }
  return "Something went wrong while processing your lecture. Please try again.";
}

// Builds the $inc part of an update for the usage counters (tokens, minutes, estimated cost).
function usageInc({ sttMinutes = 0, inputTokens = 0, outputTokens = 0 }) {
  const { sttPerMinute, llmInputPerMillion, llmOutputPerMillion } = ai.price;
  const cost =
    sttMinutes * sttPerMinute +
    (inputTokens / 1e6) * llmInputPerMillion +
    (outputTokens / 1e6) * llmOutputPerMillion;
  return {
    "usage.sttMinutes": sttMinutes,
    "usage.llmInputTokens": inputTokens,
    "usage.llmOutputTokens": outputTokens,
    "usage.estimatedCostUsd": cost,
  };
}

/**
 * Full pipeline for one lecture:
 *
 *   file -> speech-to-text (or PDF text) -> raw transcript -> cleaning -> segmentation
 *        -> LLM summarisation -> structured JSON -> Markdown for the app / PDFs
 *
 * Progress is written to MongoDB so the frontend can poll it.
 *
 * force=false (retry)       -> only generates what is still missing
 * force=true  (regenerate)  -> regenerates every requested output
 * If the cleaned transcript is already stored, the audio/PDF step is skipped.
 */
export async function processLecture(id, { force = false, signal, isCancelled } = {}) {
  const lecture = await Lecture.findById(id);
  if (!lecture) return;

  const runStart = Date.now();
  const sourcePath = lecture.filePath; // remembered now, because it is cleared below
  const workDir = path.join(process.cwd(), "tmp", String(id));

  const check = () => {
    if (signal?.aborted || isCancelled?.()) throw new CancelledError();
  };

  // ALL database writes of this job run strictly one after another (never two at the same time),
  // so progress updates can never overwrite generated content that is being saved.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const write = (update, filter = {}) => serial(() => Lecture.updateOne({ _id: id, ...filter }, update));

  // Never overwrites a lecture the student has already cancelled.
  const set = (stage, progress, extra = {}) =>
    serial(async () => {
      check();
      await Lecture.updateOne(
        { _id: id, status: { $ne: "cancelled" } },
        { $set: { status: "processing", stage, progress, ...extra } }
      );
    });

  try {
    await set("validating", 5, {
      errorMessage: "",
      processingStartedAt: new Date(),
      processingCompletedAt: null,
    });

    /* ---------- 1. text of the lecture: speech-to-text -> raw transcript -> cleaning ---------- */
    let text = lecture.transcript || "";
    let promptSummary = null; // "Write a prompt": structured version of the compact notes
    const alreadyCleaned = (lecture.pipelineStats?.cleaning?.charsBefore ?? 0) > 0;

    if (text.length < MIN_TEXT_CHARS && lecture.fileType === "TEXT") {
      // "Write a prompt": the AI first writes the lecture text, then notes / quiz / study guide are made from it
      if (!lecture.prompt) throw new UserError("The prompt is missing. Please write it again.");
      await set("preparing", 12);
      const generated = await generateSourceFromPrompt({
        prompt: lecture.prompt,
        title: lecture.title,
        course: lecture.course,
        language: lecture.language || "English",
        signal,
        // the prompt page shows this text while it is being written
        onProgress: (partial) => {
          write({ $set: { preview: partial } }).catch(() => {});
        },
      });
      check();
      text = generated.text.slice(0, ai.maxSourceChars);
      promptSummary = generated.summary;
      const words = countWords(text);
      await write({
        $set: {
          transcript: text,
          rawTranscript: text,
          wordCount: words,
          "pipelineStats.cleaning.charsBefore": text.length,
          "pipelineStats.cleaning.charsAfter": text.length,
          "pipelineStats.cleaning.wordsBefore": words,
          "pipelineStats.cleaning.wordsAfter": words,
        },
        $inc: usageInc(generated.usage),
      });
      await set("extracting", 50);
    } else if (text.length < MIN_TEXT_CHARS) {
      const source = await extractSourceText(lecture, { set, write, signal, workDir });

      await set("cleaning", 52);
      const cleaned =
        source.kind === "document"
          ? cleanDocumentText(source.parts[0])
          : cleanTranscript(source.parts, { overlapped: source.overlapped });
      text = cleaned.text.slice(0, ai.maxSourceChars);

      if (source.kind === "document" && text.length < MIN_PDF_CHARS) {
        throw new UserError("This PDF has almost no readable text. Scanned PDFs need OCR, which is not supported yet.");
      }
      if (text.length < MIN_TEXT_CHARS) throw new UserError("No clear speech was detected in this recording.");

      await write({
        $set: {
          transcript: text,
          rawTranscript: source.parts.join("\n\n"),
          wordCount: countWords(text),
          "pipelineStats.cleaning": cleaned.stats,
          filePath: "",
        },
      });
      // Privacy: the uploaded file is no longer needed once its text is saved.
      if (sourcePath) await removeFile(absolute(sourcePath));
    } else if (!alreadyCleaned) {
      // lecture that was processed before the cleaning step existed
      await set("cleaning", 52);
      const cleaned = cleanTranscript([text]);
      await write({
        $set: {
          rawTranscript: text,
          transcript: cleaned.text,
          wordCount: countWords(cleaned.text),
          "pipelineStats.cleaning": cleaned.stats,
        },
      });
      text = cleaned.text;
    }
    check();

    /* ---------- 2. segmentation into topics ---------- */
    await set("segmenting", 56);
    const segments = segmentText(text, { durationSec: lecture.durationSec || 0 });
    await write({ $set: { "pipelineStats.segmentCount": segments.length } });

    /* ---------- 3. LLM: structured content (in parallel) ---------- */
    const outputs = lecture.outputs?.length ? lecture.outputs : ALL_OUTPUTS;
    const common = {
      text,
      segments,
      title: lecture.title,
      course: lecture.course,
      language: lecture.language || "English",
      signal,
    };
    const hasQuiz = outputs.includes("quiz") ? Boolean(await Quiz.exists({ lecture: id })) : false;

    // Each task only COMPUTES its result. Everything is saved together afterwards in one atomic update.
    const tasks = [];
    if (outputs.includes("notes") && (force || !lecture.notes)) {
      tasks.push({
        key: "notes",
        run: async () => {
          // "Write a prompt": the compact text already IS the notes, so no extra AI request is needed
          if (lecture.fileType === "TEXT") {
            return {
              usage: { inputTokens: 0, outputTokens: 0 },
              set: { notes: text, ...(promptSummary ? { "structured.summary": promptSummary } : {}) },
            };
          }
          const r = await generateNotes(common);
          return { usage: r.usage, set: { notes: r.markdown, "structured.summary": r.summary } };
        },
      });
    }
    if (outputs.includes("quiz") && (force || !hasQuiz)) {
      tasks.push({
        key: "quiz",
        run: async () => {
          const r = await generateQuiz({ ...common, count: lecture.questionCount || 10 });
          // the quiz lives in its own collection (one document per lecture)
          await Quiz.findOneAndUpdate(
            { lecture: id },
            { $set: { user: lecture.user, questions: r.questions } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          return { usage: r.usage, set: {} };
        },
      });
    }
    if (outputs.includes("tutorial") && (force || !lecture.tutorial)) {
      tasks.push({
        key: "tutorial",
        run: async () => {
          const r = await generateTutorial(common);
          return { usage: r.usage, set: { tutorial: r.markdown, "structured.studyGuide": r.studyGuide } };
        },
      });
    }

    const finished = new Set();
    // The stage shown to the student = the first output that is still being generated
    const currentStage = () =>
      ["notes", "quiz", "tutorial"].find((k) => tasks.some((t) => t.key === k) && !finished.has(k)) ||
      "finalizing";

    await set(currentStage(), 60);

    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        const result = await task.run();
        finished.add(task.key);
        await set(currentStage(), 60 + Math.round((finished.size / tasks.length) * 32)).catch(() => {});
        return result;
      })
    );

    check();

    // ONE write for everything that was generated (also when another output failed)
    const content = {};
    const usage = { inputTokens: 0, outputTokens: 0 };
    results.forEach((r) => {
      if (r.status !== "fulfilled") return;
      Object.assign(content, r.value.set);
      usage.inputTokens += r.value.usage.inputTokens;
      usage.outputTokens += r.value.usage.outputTokens;
    });
    if (Object.keys(content).length || usage.inputTokens) {
      await write({ $set: content, $inc: usageInc(usage) });
    }

    const failures = results
      .map((r, i) => ({ r, key: tasks[i].key }))
      .filter((x) => x.r.status === "rejected");

    if (failures.length) {
      failures.forEach((f) => console.error(`[job ${id}] ${f.key} failed:`, f.r.reason));
      const names = failures.map((f) => f.key).join(" and ");
      const saved = failures.length < tasks.length ? " The other results were saved." : "";
      throw new UserError(`Could not generate the ${names}: ${friendlyError(failures[0].r.reason)}${saved}`);
    }

    /* ---------- 4. done ---------- */
    await set("finalizing", 96);
    const completed = await write(
      {
        $set: {
          status: "completed",
          stage: "completed",
          progress: 100,
          errorMessage: "",
          processingCompletedAt: new Date(),
          processingMs: Date.now() - runStart,
          preview: "",
        },
      },
      { status: { $ne: "cancelled" } }
    );
    // A lecture the student cancelled in the meantime is not "ready", so it matches nothing above.
    if (completed?.matchedCount) {
      await notifyUser(lecture.user, {
        type: "ready",
        title: "Your learning materials are ready",
        message: `“${clip(lecture.title, 120)}” has finished processing. Open it to read your notes or take the quiz.`,
        lecture: lecture._id,
      });
    }
  } catch (err) {
    if (err instanceof CancelledError || signal?.aborted || isCancelled?.()) {
      await write({ $set: { status: "cancelled", stage: "cancelled" } });
    } else {
      console.error(`[job ${id}] failed:`, err);
      const reason = friendlyError(err);
      const failed = await write(
        { $set: { status: "failed", stage: "failed", errorMessage: reason } },
        { status: { $ne: "cancelled" } }
      );
      if (failed?.matchedCount) {
        await notifyUser(lecture.user, {
          type: "failed",
          title: "Processing did not finish",
          message: clip(`“${clip(lecture.title, 80)}”: ${reason}`, 400),
          lecture: lecture._id,
        });
      }
    }
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* uploaded file -> raw text (no cleaning yet)                         */
/* returns { kind: "audio" | "document", parts: string[], overlapped } */
/* ------------------------------------------------------------------ */

async function extractSourceText(lecture, { set, write, signal, workDir }) {
  const file = lecture.filePath ? absolute(lecture.filePath) : "";
  if (!file || !fs.existsSync(file)) {
    throw new UserError("The original file is no longer available. Please upload it again.");
  }

  if (lecture.fileType === "PDF") {
    await set("preparing", 12);
    const text = await extractPdfText(file);
    await set("extracting", 40);
    return { kind: "document", parts: [text], overlapped: false };
  }

  // MP3 / MP4
  const duration = await getDurationSec(file, signal);
  if (duration > ai.maxDurationSec) {
    throw new UserError(`This recording is too long (the maximum is ${Math.round(ai.maxDurationSec / 60)} minutes).`);
  }
  await write({ $set: { durationSec: Math.round(duration) } });

  await set("preparing", 10);
  const { files, overlapped } = await extractChunks(file, workDir, {
    chunkSeconds: ai.chunkSeconds,
    overlapSeconds: ai.overlapSeconds,
    signal,
  });

  await set("extracting", 18);
  const parts = await transcribeChunks(files, {
    contextHint: [lecture.title, lecture.course].filter(Boolean).join(" - "),
    signal,
    onProgress: (done, total) => {
      set("extracting", 18 + Math.round((done / total) * 32)).catch(() => {}); // writes are queued, never concurrent
    },
  });

  // the overlapping seconds are transcribed twice and therefore billed twice
  const transcribedSeconds = duration + (overlapped ? (files.length - 1) * ai.overlapSeconds : 0);
  await write({ $inc: usageInc({ sttMinutes: transcribedSeconds / 60 }) });

  return { kind: "audio", parts, overlapped };
}

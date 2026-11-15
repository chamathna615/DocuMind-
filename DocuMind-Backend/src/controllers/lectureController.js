import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import Lecture from "../models/Lecture.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import { ai, uploadLimits } from "../config/aiConfig.js";
import { enqueue, cancelJob, isJobActive } from "../services/jobQueue.js";
import { buildMarkdownPdf, buildQuizPdf } from "../services/pdfBuilder.js";
import { buildStructuredExport } from "../services/documentRenderer.js";

const EXT_TO_TYPE = { mp3: "MP3", mp4: "MP4", pdf: "PDF" };
const LANGUAGES = ["English", "Sinhala", "Tamil"];
const OUTPUTS = ["notes", "quiz", "tutorial"];

const absolute = (relativePath) => path.join(process.cwd(), relativePath);
const removeFile = (file) => fs.promises.rm(file, { force: true }).catch(() => {});

// What the browser receives: never expose the server file path.
const toClient = (doc, extra = {}) => {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete obj.filePath;
  return { ...obj, active: isJobActive(obj._id), ...extra };
};

const parseOutputs = (value) => {
  if (value === undefined) return [...OUTPUTS];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(list.map((v) => String(v).trim().toLowerCase()))].filter((v) => OUTPUTS.includes(v));
};

const parseQuestionCount = (value) => Math.min(30, Math.max(1, parseInt(value, 10) || 10));

const findOwned = (req) => Lecture.findOne({ _id: req.params.id, user: req.userId });

/* ------------------------------------------------------------------ */
/* POST /api/lectures  (multipart: file, title, course, language,      */
/*                      questionCount, outputs="notes,quiz,tutorial")  */
/* ------------------------------------------------------------------ */
export const createLecture = async (req, res, next) => {
  const file = req.file;
  try {
    const reject = async (status, message) => {
      if (file) await removeFile(file.path);
      return res.status(status).json({ success: false, message });
    };

    if (!file) return reject(400, "Lecture title and file are required");

    const title = String(req.body.title || "").trim().slice(0, 200);
    if (!title) return reject(400, "Lecture title is required");

    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    const fileType = EXT_TO_TYPE[ext];
    if (!fileType) return reject(400, "Only MP3, MP4 and PDF files are allowed");
    if (file.size > uploadLimits[ext]) {
      return reject(400, `${fileType} files can be at most ${uploadLimits[ext] / 1024 / 1024} MB`);
    }

    const outputs = parseOutputs(req.body.outputs);
    if (!outputs.length) return reject(400, "Select at least one learning output");

    const language = LANGUAGES.includes(req.body.language) ? req.body.language : "English";

    // Protects your API budget: a student can only have a few jobs running at once.
    const active = await Lecture.countDocuments({
      user: req.userId,
      $or: [{ status: "processing" }, { status: "uploaded", stage: "queued" }],
    });
    if (active >= ai.maxActiveJobsPerUser) {
      return reject(429, "You already have lectures being processed. Please wait for them to finish.");
    }

    const lecture = await Lecture.create({
      user: req.userId,
      title,
      course: String(req.body.course || "").trim().slice(0, 200) || "General studies",
      filename: file.originalname.slice(0, 255),
      filePath: `uploads/${file.filename}`,
      fileType,
      fileSize: file.size,
      outputs,
      language,
      questionCount: parseQuestionCount(req.body.questionCount),
      status: "uploaded",
      stage: "queued",
      progress: 0,
    });

    enqueue(lecture._id); // processing continues in the background

    res.status(201).json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    if (file) await removeFile(file.path);
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/lectures/prompt  (JSON: prompt, title, course, language,  */
/*                             questionCount, outputs)                 */
/* "Write a prompt": AI writes the lecture text -> notes / quiz /      */
/* study guide -> saved in Lecture History -> PDFs via /download/:kind */
/* ------------------------------------------------------------------ */
export const createPromptLecture = async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (prompt.length < 10) {
      return res.status(400).json({ success: false, message: "Please write a longer prompt (at least 10 characters)" });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ success: false, message: "The prompt can be at most 4000 characters" });
    }

    const outputs = req.body?.outputs === undefined ? ["notes", "quiz"] : parseOutputs(req.body.outputs);
    if (!outputs.length) {
      return res.status(400).json({ success: false, message: "Select at least one learning output" });
    }

    const language = LANGUAGES.includes(req.body?.language) ? req.body.language : "English";

    const active = await Lecture.countDocuments({
      user: req.userId,
      $or: [{ status: "processing" }, { status: "uploaded", stage: "queued" }],
    });
    if (active >= ai.maxActiveJobsPerUser) {
      return res
        .status(429)
        .json({ success: false, message: "You already have lectures being processed. Please wait for them to finish." });
    }

    const title =
      String(req.body?.title || "").trim().slice(0, 200) || prompt.replace(/\s+/g, " ").slice(0, 60).trim();

    const lecture = await Lecture.create({
      user: req.userId,
      title,
      course: String(req.body?.course || "").trim().slice(0, 200) || "General studies",
      filename: "prompt.txt",
      fileType: "TEXT",
      fileSize: Buffer.byteLength(prompt, "utf8"),
      prompt,
      outputs,
      language,
      questionCount: parseQuestionCount(req.body?.questionCount),
      status: "uploaded",
      stage: "queued",
      progress: 0,
    });

    enqueue(lecture._id);
    res.status(201).json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/lectures                                                   */
/* ------------------------------------------------------------------ */
export const getLectures = async (req, res, next) => {
  try {
    const lectures = await Lecture.find({ user: req.userId })
      .select("-filePath -notes -tutorial -transcript -structured -prompt -preview") // keep the list light
      .sort({ createdAt: -1 })
      .lean();

    // latest quiz score (percent) per lecture: newest attempt first, keep the first one seen
    const attempts = await QuizAttempt.find({
      user: req.userId,
      lecture: { $in: lectures.map((l) => l._id) },
    })
      .sort({ createdAt: -1 })
      .select("lecture score total")
      .lean();
    const percentByLecture = new Map();
    for (const a of attempts) {
      const key = String(a.lecture);
      if (!percentByLecture.has(key)) {
        percentByLecture.set(key, a.total ? Math.round((a.score / a.total) * 100) : null);
      }
    }

    res.json({
      success: true,
      lectures: lectures.map((l) =>
        toClient(l, { quizPercent: percentByLecture.get(String(l._id)) ?? null })
      ),
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/lectures/:id                                               */
/*   ?transcript=1    also returns the cleaned transcript              */
/*   ?transcript=raw  also returns the raw speech-to-text output       */
/* ------------------------------------------------------------------ */
export const searchLectures = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (q.length < 2) return res.json({ success: true, ids: [] });

    // The text is matched literally (every regex character is escaped), case-insensitively,
    // in the title, course, file name, prompt and the generated notes / study guide / transcript.
    const pattern = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const found = await Lecture.find({
      user: req.userId,
      $or: [
        { title: pattern },
        { course: pattern },
        { filename: pattern },
        { prompt: pattern },
        { notes: pattern },
        { tutorial: pattern },
        { transcript: pattern },
      ],
    })
      .select("_id")
      .limit(200)
      .lean();

    res.json({ success: true, ids: found.map((l) => String(l._id)) });
  } catch (error) {
    next(error);
  }
};

export const getLecture = async (req, res, next) => {
  try {
    const wantsRaw = req.query.transcript === "raw";
    const wantsTranscript = req.query.transcript === "1" || wantsRaw;
    const fields = [
      "-filePath",
      "-structured",
      ...(wantsTranscript ? [] : ["-transcript"]),
      ...(wantsRaw ? ["+rawTranscript"] : []),
    ].join(" ");

    const lecture = await Lecture.findOne({ _id: req.params.id, user: req.userId }).select(fields);
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });
    res.json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /api/lectures/:id  (students may edit title, course, notes, study guide) */
/* ------------------------------------------------------------------ */
export const updateLecture = async (req, res, next) => {
  try {
    const allowedFields = ["title", "course", "notes", "tutorial"];
    const limits = { title: 200, course: 200, notes: 200000, tutorial: 200000 };
    const updates = {};
    for (const key of allowedFields) {
      const value = req.body?.[key];
      if (value === undefined) continue;
      // Only plain strings of a sane size are accepted (no objects/arrays, no huge payloads)
      if (typeof value !== "string" || value.length > limits[key]) {
        return res.status(400).json({ success: false, message: `Invalid value for "${key}"` });
      }
      updates[key] = key === "title" || key === "course" ? value.trim() : value;
    }
    if (updates.title === "") {
      return res.status(400).json({ success: false, message: "Lecture title cannot be empty" });
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No valid lecture fields provided" });
    }

    const lecture = await Lecture.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-filePath -transcript -structured");

    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });
    res.json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/lectures/:id                                            */
/* ------------------------------------------------------------------ */
export const deleteLecture = async (req, res, next) => {
  try {
    const lecture = await findOwned(req);
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });

    cancelJob(lecture._id); // stop processing first, if it is running
    if (lecture.filePath) await removeFile(absolute(lecture.filePath));
    await Promise.all([
      Quiz.deleteMany({ lecture: lecture._id }),
      QuizAttempt.deleteMany({ lecture: lecture._id }),
      Lecture.deleteOne({ _id: lecture._id }),
    ]);

    res.json({ success: true, message: "Lecture deleted" });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/lectures/:id/cancel                                       */
/* ------------------------------------------------------------------ */
export const cancelLecture = async (req, res, next) => {
  try {
    const lecture = await findOwned(req);
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });
    if (!["uploaded", "processing"].includes(lecture.status)) {
      return res.status(409).json({ success: false, message: "This lecture is not being processed" });
    }

    cancelJob(lecture._id);
    lecture.status = "cancelled";
    lecture.stage = "cancelled";
    await lecture.save();

    res.json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/lectures/:id/retry       -> generate only what is missing */
/* POST /api/lectures/:id/regenerate  -> regenerate everything         */
/*   regenerate body (optional): { outputs, language, questionCount }  */
/* ------------------------------------------------------------------ */
const restart = (force) => async (req, res, next) => {
  try {
    const lecture = await findOwned(req);
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });

    if (isJobActive(lecture._id)) {
      return res.status(409).json({ success: false, message: "This lecture is still being processed" });
    }

    const hasSource =
      lecture.transcript.length >= 50 ||
      Boolean(lecture.prompt) ||
      (lecture.filePath && fs.existsSync(absolute(lecture.filePath)));
    if (!hasSource) {
      return res.status(409).json({
        success: false,
        message: "The original file was removed for privacy. Please upload the lecture again.",
      });
    }

    const active = await Lecture.countDocuments({
      user: req.userId,
      $or: [{ status: "processing" }, { status: "uploaded", stage: "queued" }],
    });
    if (active >= ai.maxActiveJobsPerUser) {
      return res.status(429).json({ success: false, message: "Please wait for your other lectures to finish." });
    }

    if (force) {
      if (req.body?.outputs !== undefined) {
        const outputs = parseOutputs(req.body.outputs);
        if (!outputs.length) return res.status(400).json({ success: false, message: "Select at least one output" });
        lecture.outputs = outputs;
      }
      if (LANGUAGES.includes(req.body?.language)) lecture.language = req.body.language;
      if (req.body?.questionCount !== undefined) lecture.questionCount = parseQuestionCount(req.body.questionCount);
    }

    lecture.status = "uploaded";
    lecture.stage = "queued";
    lecture.progress = 0;
    lecture.errorMessage = "";
    await lecture.save();

    enqueue(lecture._id, { force });
    res.json({ success: true, lecture: toClient(lecture) });
  } catch (error) {
    next(error);
  }
};
export const retryLecture = restart(false);
export const regenerateLecture = restart(true);

/* ------------------------------------------------------------------ */
/* GET /api/lectures/:id/download/:kind                                */
/*   kind = notes | tutorial | quiz | answer-key | json | pack (zip)  */
/* ------------------------------------------------------------------ */
const safeBaseName = (title) =>
  String(title)
    .replace(/[^\p{L}\p{N}\- _]+/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "lecture";

const contentDisposition = (filename) => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

async function buildFile(kind, lecture, quiz) {
  const base = safeBaseName(lecture.title);
  const common = { title: lecture.title, course: lecture.course };

  switch (kind) {
    case "notes":
      if (!lecture.notes) return null;
      return {
        name: `${base}-notes.pdf`,
        buffer: await buildMarkdownPdf({ ...common, label: "Summary notes", markdown: lecture.notes }),
      };
    case "tutorial":
      if (!lecture.tutorial) return null;
      return {
        name: `${base}-study-guide.pdf`,
        buffer: await buildMarkdownPdf({ ...common, label: "Study guide", markdown: lecture.tutorial }),
      };
    case "quiz":
    case "answer-key":
      if (!quiz?.questions?.length) return null;
      return {
        name: `${base}-${kind === "quiz" ? "quiz" : "quiz-answer-key"}.pdf`,
        buffer: await buildQuizPdf({ ...common, questions: quiz.questions, withAnswers: kind === "answer-key" }),
      };
    case "json": {
      const exported = buildStructuredExport(lecture, quiz);
      if (!exported.summary && !exported.studyGuide && !exported.quiz.length) return null;
      return {
        name: `${base}-structured.json`,
        type: "application/json; charset=utf-8",
        buffer: Buffer.from(JSON.stringify(exported, null, 2), "utf8"),
      };
    }
    default:
      return null;
  }
}

export const downloadLecture = async (req, res, next) => {
  try {
    const { kind } = req.params;
    if (!["notes", "tutorial", "quiz", "answer-key", "json", "pack"].includes(kind)) {
      return res.status(400).json({ success: false, message: "Unknown download type" });
    }

    const lecture = await Lecture.findOne({ _id: req.params.id, user: req.userId })
      .select("-filePath -transcript")
      .lean();
    if (!lecture) return res.status(404).json({ success: false, message: "Lecture not found" });

    const quiz = await Quiz.findOne({ lecture: lecture._id, user: req.userId }).lean();

    if (kind === "pack") {
      const files = (
        await Promise.all(["notes", "tutorial", "quiz", "answer-key", "json"].map((k) => buildFile(k, lecture, quiz)))
      ).filter(Boolean);
      if (!files.length) {
        return res.status(404).json({ success: false, message: "Nothing has been generated yet" });
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", contentDisposition(`${safeBaseName(lecture.title)}-study-pack.zip`));
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", next);
      archive.pipe(res);
      files.forEach((f) => archive.append(f.buffer, { name: f.name }));
      await archive.finalize();
      return;
    }

    const file = await buildFile(kind, lecture, quiz);
    if (!file) {
      return res.status(404).json({ success: false, message: "This material has not been generated yet" });
    }
    res.setHeader("Content-Type", file.type ?? "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(file.name));
    res.send(file.buffer);
  } catch (error) {
    next(error);
  }
};


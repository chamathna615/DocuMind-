import mongoose from "mongoose";
import CodeGeneration from "../models/CodeGeneration.js";
import { ai } from "../config/aiConfig.js";
import { enqueueCode, cancelCodeJob, isCodeJobActive } from "../services/codeJobQueue.js";

const LANGUAGES = ["English", "Sinhala", "Tamil"];
// Keep this list in sync with the "Programming language" choices on the page. "auto" = the model chooses.
const PROGRAMMING_LANGUAGES = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "C",
  "Go",
  "Rust",
  "PHP",
  "Ruby",
  "Kotlin",
  "Swift",
  "Dart",
  "SQL",
  "Bash",
  "HTML/CSS",
  "R",
];

// What the browser receives
const toClient = (doc, extra = {}) => {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return { ...obj, active: isCodeJobActive(obj._id), ...extra };
};

const notFound = (res) => res.status(404).json({ success: false, message: "Code request not found" });
const validId = (req) => mongoose.isValidObjectId(req.params.id);
const findOwned = (req) => CodeGeneration.findOne({ _id: req.params.id, user: req.userId });

// Protects your API budget: a student can only have a few requests running at once.
const countActive = (userId) =>
  CodeGeneration.countDocuments({ user: userId, status: { $in: ["queued", "processing"] } });

/* ------------------------------------------------------------------ */
/* POST /api/code  (JSON: prompt, programmingLanguage, language,       */
/*                  options: { explanation, example, tests })          */
/* ------------------------------------------------------------------ */
export const createCode = async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (prompt.length < 10) {
      return res.status(400).json({ success: false, message: "Please write a longer prompt (at least 10 characters)" });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ success: false, message: "The prompt can be at most 4000 characters" });
    }

    const programmingLanguage = PROGRAMMING_LANGUAGES.includes(req.body?.programmingLanguage)
      ? req.body.programmingLanguage
      : "auto";
    const language = LANGUAGES.includes(req.body?.language) ? req.body.language : "English";
    const chosen = req.body?.options && typeof req.body.options === "object" ? req.body.options : {};
    const options = {
      explanation: chosen.explanation !== false,
      example: chosen.example !== false,
      tests: chosen.tests === true,
    };

    if ((await countActive(req.userId)) >= ai.maxActiveJobsPerUser) {
      return res
        .status(429)
        .json({ success: false, message: "You already have code being generated. Please wait for it to finish." });
    }

    const doc = await CodeGeneration.create({
      user: req.userId,
      title: prompt.replace(/\s+/g, " ").slice(0, 60).trim(),
      prompt,
      programmingLanguage,
      language,
      options,
      status: "queued",
      stage: "queued",
      progress: 0,
    });

    enqueueCode(doc._id); // generation continues in the background
    res.status(201).json({ success: true, code: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/code            (newest first, without the long text)      */
/* GET /api/code/:id        (with the preview / finished answer)       */
/* ------------------------------------------------------------------ */
export const listCode = async (req, res, next) => {
  try {
    const items = await CodeGeneration.find({ user: req.userId })
      .select("-preview -result")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, items: items.map((item) => toClient(item)) });
  } catch (error) {
    next(error);
  }
};

export const getCode = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);
    res.json({ success: true, code: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/code/:id/cancel                                           */
/* ------------------------------------------------------------------ */
export const cancelCode = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);
    if (!["queued", "processing"].includes(doc.status)) {
      return res.status(409).json({ success: false, message: "This request is not being processed" });
    }

    cancelCodeJob(doc._id);
    doc.status = "cancelled";
    doc.stage = "cancelled";
    await doc.save();

    res.json({ success: true, code: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/code/:id/retry   (starts the same request again)          */
/* ------------------------------------------------------------------ */
export const retryCode = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);

    if (isCodeJobActive(doc._id)) {
      return res.status(409).json({ success: false, message: "This request is still being processed" });
    }
    if ((await countActive(req.userId)) >= ai.maxActiveJobsPerUser) {
      return res.status(429).json({ success: false, message: "Please wait for your other requests to finish." });
    }

    doc.status = "queued";
    doc.stage = "queued";
    doc.progress = 0;
    doc.errorMessage = "";
    doc.preview = "";
    doc.result = "";
    await doc.save();

    enqueueCode(doc._id);
    res.json({ success: true, code: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/code/:id                                                */
/* ------------------------------------------------------------------ */
export const deleteCode = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);

    cancelCodeJob(doc._id); // stop it first, if it is running
    await CodeGeneration.deleteOne({ _id: doc._id });
    res.json({ success: true, message: "Code request deleted" });
  } catch (error) {
    next(error);
  }
};

import mongoose from "mongoose";
import Diagram from "../models/Diagram.js";
import { ai } from "../config/aiConfig.js";
import { enqueueDiagram, cancelDiagramJob, isDiagramJobActive } from "../services/diagramJobQueue.js";
import { DIAGRAM_TYPES, DETAIL_LEVELS, repairMermaid, estimateCost } from "../services/diagramService.js";
import { findMermaidBlocks, replaceMermaidBlock } from "../utils/mermaidBlocks.js";

const LANGUAGES = ["English", "Sinhala", "Tamil"];

// What the browser receives
const toClient = (doc, extra = {}) => {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return { ...obj, active: isDiagramJobActive(obj._id), ...extra };
};

const notFound = (res) => res.status(404).json({ success: false, message: "Diagram request not found" });
const validId = (req) => mongoose.isValidObjectId(req.params.id);
const findOwned = (req) => Diagram.findOne({ _id: req.params.id, user: req.userId });

// Protects your API budget: a student can only have a few requests running at once.
const countActive = (userId) => Diagram.countDocuments({ user: userId, status: { $in: ["queued", "processing"] } });

/* ------------------------------------------------------------------ */
/* POST /api/diagrams  (JSON: prompt, diagramType, detail, language,   */
/*                      options: { explanation })                      */
/* ------------------------------------------------------------------ */
export const createDiagram = async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (prompt.length < 10) {
      return res.status(400).json({ success: false, message: "Please write a longer prompt (at least 10 characters)" });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ success: false, message: "The prompt can be at most 4000 characters" });
    }

    const diagramType = Object.hasOwn(DIAGRAM_TYPES, req.body?.diagramType) ? req.body.diagramType : "auto";
    const detail = Object.hasOwn(DETAIL_LEVELS, req.body?.detail) ? req.body.detail : "standard";
    const language = LANGUAGES.includes(req.body?.language) ? req.body.language : "English";
    const chosen = req.body?.options && typeof req.body.options === "object" ? req.body.options : {};
    const options = { explanation: chosen.explanation !== false };

    if ((await countActive(req.userId)) >= ai.maxActiveJobsPerUser) {
      return res
        .status(429)
        .json({ success: false, message: "You already have a diagram being generated. Please wait for it to finish." });
    }

    const doc = await Diagram.create({
      user: req.userId,
      title: prompt.replace(/\s+/g, " ").slice(0, 60).trim(),
      prompt,
      diagramType,
      detail,
      language,
      options,
      status: "queued",
      stage: "queued",
      progress: 0,
    });

    enqueueDiagram(doc._id); // generation continues in the background
    res.status(201).json({ success: true, diagram: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/diagrams        (newest first, without the long text)      */
/* GET /api/diagrams/:id    (with the preview / finished answer)       */
/* ------------------------------------------------------------------ */
export const listDiagrams = async (req, res, next) => {
  try {
    const items = await Diagram.find({ user: req.userId })
      .select("-preview -result")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, items: items.map((item) => toClient(item)) });
  } catch (error) {
    next(error);
  }
};

export const getDiagram = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);
    res.json({ success: true, diagram: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/diagrams/:id/cancel                                       */
/* ------------------------------------------------------------------ */
export const cancelDiagram = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);
    if (!["queued", "processing"].includes(doc.status)) {
      return res.status(409).json({ success: false, message: "This request is not being processed" });
    }

    cancelDiagramJob(doc._id);
    doc.status = "cancelled";
    doc.stage = "cancelled";
    await doc.save();

    res.json({ success: true, diagram: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/diagrams/:id/retry   (starts the same request again)      */
/* ------------------------------------------------------------------ */
export const retryDiagram = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);

    if (isDiagramJobActive(doc._id)) {
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

    enqueueDiagram(doc._id);
    res.json({ success: true, diagram: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/diagrams/:id/repair  (JSON: error, blockIndex)            */
/* The page could not draw the diagram: the model fixes the Mermaid    */
/* code using the error message, and the fixed code is saved.          */
/* ------------------------------------------------------------------ */
export const repairDiagram = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);

    if (doc.status !== "completed") {
      return res.status(409).json({ success: false, message: "Only a finished diagram can be fixed" });
    }
    const blockIndex = Number.isInteger(req.body?.blockIndex) && req.body.blockIndex >= 0 ? req.body.blockIndex : 0;
    const block = findMermaidBlocks(doc.result)[blockIndex];
    if (!block) {
      return res.status(409).json({ success: false, message: "This answer has no diagram code to fix" });
    }

    const fixed = await repairMermaid({
      code: block.code,
      error: String(req.body?.error || "").slice(0, 1000),
      language: doc.language || "English",
    });
    const result = replaceMermaidBlock(doc.result, blockIndex, fixed.code);
    if (!result) {
      return res.status(500).json({ success: false, message: "The fixed diagram could not be saved. Please try again." });
    }

    await Diagram.updateOne(
      { _id: doc._id, status: "completed" },
      {
        $set: { result },
        $inc: {
          "usage.llmInputTokens": fixed.usage.inputTokens,
          "usage.llmOutputTokens": fixed.usage.outputTokens,
          "usage.estimatedCostUsd": estimateCost(fixed.usage),
        },
      }
    );
    doc.result = result;
    res.json({ success: true, diagram: toClient(doc) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/diagrams/:id                                            */
/* ------------------------------------------------------------------ */
export const deleteDiagram = async (req, res, next) => {
  try {
    if (!validId(req)) return notFound(res);
    const doc = await findOwned(req);
    if (!doc) return notFound(res);

    cancelDiagramJob(doc._id); // stop it first, if it is running
    await Diagram.deleteOne({ _id: doc._id });
    res.json({ success: true, message: "Diagram request deleted" });
  } catch (error) {
    next(error);
  }
};

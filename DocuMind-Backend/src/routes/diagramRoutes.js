import express from "express";
import protect from "../middleware/authMiddleware.js";
import { heavyLimiter } from "../middleware/securityMiddleware.js";
import {
  createDiagram,
  listDiagrams,
  getDiagram,
  cancelDiagram,
  retryDiagram,
  repairDiagram,
  deleteDiagram,
} from "../controllers/diagramController.js";

const router = express.Router();

// heavyLimiter = per-user hourly cap on actions that cost money (AI generation).
// It runs after `protect` (needs the user id).
router.route("/").post(protect, heavyLimiter, createDiagram).get(protect, listDiagrams);

router.route("/:id").get(protect, getDiagram).delete(protect, deleteDiagram);

router.post("/:id/cancel", protect, cancelDiagram);
router.post("/:id/retry", protect, heavyLimiter, retryDiagram);
router.post("/:id/repair", protect, heavyLimiter, repairDiagram);

export default router;

import express from "express";
import protect from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/adminMiddleware.js";
import {
  cancelCodeRequest,
  cancelDiagramRequest,
  cancelUpload,
  deleteCodeRequest,
  deleteDiagramRequest,
  deleteUpload,
  deleteUser,
  getCodeRequests,
  getDashboardStats,
  getDiagramRequests,
  getLogs,
  getUploads,
  getUsers,
  updateUser,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(protect, requireAdmin);

router.get("/stats", getDashboardStats);

router.get("/users", getUsers);
router.patch("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

router.get("/uploads", getUploads);
router.post("/uploads/:id/cancel", cancelUpload);
router.delete("/uploads/:id", deleteUpload);

// "Generate code" and "Generate diagram" requests
router.get("/code", getCodeRequests);
router.post("/code/:id/cancel", cancelCodeRequest);
router.delete("/code/:id", deleteCodeRequest);

router.get("/diagrams", getDiagramRequests);
router.post("/diagrams/:id/cancel", cancelDiagramRequest);
router.delete("/diagrams/:id", deleteDiagramRequest);

router.get("/logs", getLogs);

export default router;

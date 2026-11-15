import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  listNotifications,
  markAllRead,
  markRead,
  deleteNotification,
  clearNotifications,
} from "../controllers/notificationController.js";

const router = express.Router();

router.route("/").get(protect, listNotifications).delete(protect, clearNotifications);
router.post("/read-all", protect, markAllRead);
router.patch("/:id/read", protect, markRead);
router.delete("/:id", protect, deleteNotification);

export default router;

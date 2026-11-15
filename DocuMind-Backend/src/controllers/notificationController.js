import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { maybeCreateWeeklySummary } from "../services/notificationService.js";

const MAX_LISTED = 30;

const toClient = (n) => ({
  id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  lectureId: n.lecture ? String(n.lecture) : null,
  read: n.read,
  createdAt: n.createdAt,
});

const badId = (res) => res.status(400).json({ success: false, message: "Invalid notification id" });

// @route  GET /api/notifications  (protected)
// The newest notifications plus the number of unread ones (for the badge on the bell).
export const listNotifications = async (req, res, next) => {
  try {
    await maybeCreateWeeklySummary(req.userId);
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.userId }).sort({ createdAt: -1 }).limit(MAX_LISTED).lean(),
      Notification.countDocuments({ user: req.userId, read: false }),
    ]);
    res.status(200).json({ success: true, notifications: items.map(toClient), unread });
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/notifications/read-all  (protected)
export const markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.userId, read: false }, { $set: { read: true } }, { timestamps: false });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// @route  PATCH /api/notifications/:id/read  (protected)
export const markRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    await Notification.updateOne(
      { _id: req.params.id, user: req.userId },
      { $set: { read: true } },
      { timestamps: false }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// @route  DELETE /api/notifications/:id  (protected)
export const deleteNotification = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    await Notification.deleteOne({ _id: req.params.id, user: req.userId });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// @route  DELETE /api/notifications  (protected)  - clears the whole list
export const clearNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.userId });
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

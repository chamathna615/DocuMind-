import User from "../models/User.js";
import Lecture from "../models/Lecture.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Notification from "../models/Notification.js";

// Used when a student has never opened the notification settings.
const DEFAULT_ENABLED = { ready: true, failed: true, weekly: false };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates one in-app notification, but only when the student has that kind of notification switched on
 * (Account page > Notifications). It never throws: a notification problem must never break a lecture job.
 * Returns true when a notification was created.
 */
export async function notifyUser(userId, { type, title, message = "", lecture = null }) {
  try {
    const user = await User.findById(userId).select("preferences").lean();
    if (!user) return false;
    const enabled = user.preferences?.notifications?.[type] ?? DEFAULT_ENABLED[type] ?? true;
    if (!enabled) return false;
    await Notification.create({ user: userId, type, title, message, lecture });
    return true;
  } catch (err) {
    console.error("[notify] could not create a notification:", err.message);
    return false;
  }
}

/**
 * "Weekly study summary": at most once every 7 days, and only when the student switched it on and
 * did something during the last 7 days. It is created the next time the student's notifications are
 * loaded, so no background scheduler is needed.
 */
export async function maybeCreateWeeklySummary(userId) {
  try {
    const user = await User.findById(userId).select("preferences +lastWeeklySummaryAt").lean();
    if (!user || !user.preferences?.notifications?.weekly) return;

    const now = Date.now();
    if (user.lastWeeklySummaryAt && now - new Date(user.lastWeeklySummaryAt).getTime() < WEEK_MS) return;

    const since = new Date(now - WEEK_MS);
    const [lectures, attempts] = await Promise.all([
      Lecture.countDocuments({ user: userId, status: "completed", processingCompletedAt: { $gte: since } }),
      QuizAttempt.find({ user: userId, createdAt: { $gte: since } }).select("score total").lean(),
    ]);
    if (!lectures && !attempts.length) return; // nothing to report

    // Claim this week's slot first, so two requests at the same moment cannot create two summaries.
    const claimed = await User.findOneAndUpdate(
      {
        _id: userId,
        $or: [{ lastWeeklySummaryAt: null }, { lastWeeklySummaryAt: { $lt: new Date(now - WEEK_MS) } }],
      },
      { $set: { lastWeeklySummaryAt: new Date(now) } },
      { timestamps: false }
    );
    if (!claimed) return;

    const parts = [];
    if (lectures) parts.push(`${lectures} lecture${lectures === 1 ? "" : "s"} processed`);
    if (attempts.length) {
      const percent = attempts.reduce((sum, a) => sum + (a.total ? a.score / a.total : 0), 0) / attempts.length;
      parts.push(
        `${attempts.length} quiz attempt${attempts.length === 1 ? "" : "s"} (average ${Math.round(percent * 100)}%)`
      );
    }
    await Notification.create({
      user: userId,
      type: "weekly",
      title: "Your weekly study summary",
      message: `In the last 7 days: ${parts.join(" and ")}.`,
    });
  } catch (err) {
    console.error("[notify] weekly summary failed:", err.message);
  }
}

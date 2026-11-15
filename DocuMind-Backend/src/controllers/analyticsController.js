import Lecture from "../models/Lecture.js";
import QuizAttempt from "../models/QuizAttempt.js";

const percentOf = (attempt) => (attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0);

// GET /api/analytics/me  - numbers for the student's dashboard
export const getMyAnalytics = async (req, res, next) => {
  try {
    const [lectures, attempts] = await Promise.all([
      Lecture.find({ user: req.userId }).select("status durationSec").lean(),
      QuizAttempt.find({ user: req.userId })
        .sort({ createdAt: -1 }) // newest first
        .select("lecture score total createdAt")
        .populate("lecture", "title")
        .lean(),
    ]);

    const count = (status) => lectures.filter((l) => l.status === status).length;
    const totalSeconds = lectures.reduce((sum, l) => sum + (l.durationSec || 0), 0);
    const percents = attempts.map(percentOf);

    res.json({
      success: true,
      analytics: {
        totals: {
          lectures: lectures.length,
          completed: count("completed"),
          failed: count("failed"),
          inProgress: count("processing"),
          minutesOfRecordings: Math.round(totalSeconds / 60),
        },
        quiz: {
          attempts: attempts.length,
          lecturesAttempted: new Set(attempts.map((a) => String(a.lecture?._id ?? a.lecture))).size,
          averagePercent: percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
          bestPercent: percents.length ? Math.max(...percents) : null,
        },
        recentAttempts: attempts.slice(0, 8).map((a) => ({
          lectureId: a.lecture?._id ?? null,
          title: a.lecture?.title ?? "Deleted lecture",
          percent: percentOf(a),
          score: a.score,
          total: a.total,
          takenAt: a.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

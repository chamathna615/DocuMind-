import mongoose from "mongoose";
import User from "../models/User.js";
import Lecture from "../models/Lecture.js";
import QuizAttempt from "../models/QuizAttempt.js";
import CodeGeneration from "../models/CodeGeneration.js";
import Diagram from "../models/Diagram.js";
import { getAiUsageStats } from "../services/analyticsService.js";
import { cancelJob, isJobActive } from "../services/jobQueue.js";
import { cancelCodeJob, isCodeJobActive } from "../services/codeJobQueue.js";
import { cancelDiagramJob, isDiagramJobActive } from "../services/diagramJobQueue.js";
import { deleteLectureData, deleteUserData } from "../services/userCleanup.js";
import { readRecentSecurityEvents, securityLog } from "../utils/securityLog.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const bad = (res, status, message) => res.status(status).json({ success: false, message });
const validId = (value) => mongoose.isValidObjectId(value);

// 161000 ms -> "2m 41s"
const formatDuration = (ms) => {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
};

// counts = { uploads, code, diagrams }: how much this person has created
const toAdminUser = (user, counts = {}) => ({
  id: user._id,
  name: user.fullName,
  email: user.email,
  role: user.role,
  status: user.status,
  provider: user.provider || "local",
  uploadCount: counts.uploads ?? 0,
  codeCount: counts.code ?? 0,
  diagramCount: counts.diagrams ?? 0,
  joinedAt: user.createdAt,
  // the time of the last sign-in; null for accounts that have not signed in since this was introduced
  lastActive: user.lastLoginAt ?? null,
});

/* ------------------------------------------------------------------ */
/* GET /api/admin/users                                                */
/* ------------------------------------------------------------------ */
export const getUsers = async (req, res, next) => {
  try {
    // Two small queries instead of joining every lecture (with its long notes) into every user.
    const countBy = (Model) => Model.aggregate([{ $group: { _id: "$user", count: { $sum: 1 } } }]);
    const toMap = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));
    const [users, uploadRows, codeRows, diagramRows] = await Promise.all([
      User.find()
        .select("fullName email role status provider createdAt lastLoginAt")
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean(),
      countBy(Lecture),
      countBy(CodeGeneration),
      countBy(Diagram),
    ]);
    const uploadsByUser = toMap(uploadRows);
    const codeByUser = toMap(codeRows);
    const diagramsByUser = toMap(diagramRows);

    res.json({
      success: true,
      users: users.map((user) => {
        const id = String(user._id);
        return toAdminUser(user, {
          uploads: uploadsByUser.get(id) ?? 0,
          code: codeByUser.get(id) ?? 0,
          diagrams: diagramsByUser.get(id) ?? 0,
        });
      }),
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /api/admin/users/:id   body: { status?: "active"|"inactive", role?: "student"|"admin" } */
/* ------------------------------------------------------------------ */
export const updateUser = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return bad(res, 404, "User not found");

    const { status, role } = req.body ?? {};
    const set = {};
    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) return bad(res, 400, "Status must be active or inactive");
      set.status = status;
    }
    if (role !== undefined) {
      if (!["student", "admin"].includes(role)) return bad(res, 400, "Role must be student or admin");
      set.role = role;
    }
    if (!Object.keys(set).length) return bad(res, 400, "Nothing to update");

    // An administrator who could lock themselves out (or remove their own rights) by mistake would
    // leave the platform without anybody to manage it.
    if (String(req.params.id) === String(req.userId)) {
      return bad(res, 400, "You cannot change your own role or status.");
    }

    const target = await User.findById(req.params.id).select("role status");
    if (!target) return bad(res, 404, "User not found");

    const losesAdminRights =
      target.role === "admin" &&
      target.status === "active" &&
      ((set.role && set.role !== "admin") || (set.status && set.status !== "active"));
    if (losesAdminRights) {
      const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: "admin", status: "active" });
      if (!otherAdmins) return bad(res, 409, "At least one active administrator is required.");
    }

    const update = { $set: set };
    // A deactivated account (or one whose role changed) is signed out everywhere straight away.
    if (set.status === "inactive" || (set.role && set.role !== target.role)) update.$inc = { tokenVersion: 1 };

    const user = await User.findByIdAndUpdate(target._id, update, { new: true })
      .select("fullName email role status provider createdAt lastLoginAt")
      .lean();
    const [uploads, code, diagrams] = await Promise.all([
      Lecture.countDocuments({ user: target._id }),
      CodeGeneration.countDocuments({ user: target._id }),
      Diagram.countDocuments({ user: target._id }),
    ]);

    securityLog("admin_user_updated", req, { userId: String(req.userId), target: String(target._id), changes: set });
    res.json({ success: true, user: toAdminUser(user, { uploads, code, diagrams }) });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/admin/users/:id   (the account and everything it owns)  */
/* ------------------------------------------------------------------ */
export const deleteUser = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return bad(res, 404, "User not found");
    if (String(req.params.id) === String(req.userId)) {
      return bad(res, 400, "You cannot delete your own account here. Use the Account page instead.");
    }

    const target = await User.findById(req.params.id).select("_id");
    if (!target) return bad(res, 404, "User not found");

    await deleteUserData(target._id);
    await User.deleteOne({ _id: target._id });

    securityLog("admin_user_deleted", req, { userId: String(req.userId), target: String(target._id) });
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/admin/stats                                                */
/* ------------------------------------------------------------------ */

// ["2025-06-01", ..., "2025-06-07"]: the last n days (UTC), oldest first
const lastDays = (n) =>
  Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));

// How many documents were created on each of the given days. Days without any show 0 (so the chart has no gaps).
async function dailyCounts(Model, days) {
  const since = new Date(`${days[0]}T00:00:00.000Z`);
  const rows = await Model.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, value: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((row) => [row._id, row.value]));
  return days.map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

export const getDashboardStats = async (req, res, next) => {
  try {
    const days = lastDays(7);

    const [
      totalUsers,
      activeUsers,
      totalUploads,
      completedJobs,
      failedJobs,
      uploadsOverTime,
      statusRows,
      fileTypeRows,
      quizAttemptTrend,
      aiStats,
      codeRequests,
      failedCodeRequests,
      diagramRequests,
      failedDiagramRequests,
      codeOverTime,
      diagramOverTime,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: "active" }),
      Lecture.countDocuments(),
      Lecture.countDocuments({ status: "completed" }),
      Lecture.countDocuments({ status: "failed" }),
      dailyCounts(Lecture, days),
      Lecture.aggregate([{ $group: { _id: "$status", value: { $sum: 1 } } }]),
      Lecture.aggregate([{ $group: { _id: "$fileType", value: { $sum: 1 } } }]),
      dailyCounts(QuizAttempt, days),
      // AI usage, estimated cost, processing time, pipeline + quiz statistics
      getAiUsageStats(),
      CodeGeneration.countDocuments(),
      CodeGeneration.countDocuments({ status: "failed" }),
      Diagram.countDocuments(),
      Diagram.countDocuments({ status: "failed" }),
      dailyCounts(CodeGeneration, days),
      dailyCounts(Diagram, days),
    ]);

    const colors = {
      completed: "#15803D",
      processing: "#7457C8",
      uploaded: "#2563EB",
      failed: "#DC2626",
      cancelled: "#94A3B8",
    };

    const statusDistribution = statusRows.map((item) => ({
      name: item._id,
      value: item.value,
      color: colors[item._id] || "#64748B",
    }));

    const fileTypeDistribution = fileTypeRows.map((item) => ({
      type: item._id,
      value: item.value,
    }));

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        totalUploads,
        completedJobs,
        failedJobs,
        averageTime: formatDuration(aiStats.averageProcessingMs),
        uploadsOverTime,
        statusDistribution,
        fileTypeDistribution,
        quizAttemptTrend,
        usage: aiStats.usage,
        pipeline: aiStats.pipeline,
        costOverTime: aiStats.costOverTime,
        quizAttempts: aiStats.quizAttempts,
        averageQuizPercent: aiStats.averageQuizPercent,
        // "Generate code" and "Generate diagram"
        codeRequests,
        failedCodeRequests,
        diagramRequests,
        failedDiagramRequests,
        codeOverTime,
        diagramOverTime,
        byFeature: aiStats.byFeature,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* GET    /api/admin/uploads              (newest 300 lectures)        */
/* POST   /api/admin/uploads/:id/cancel   (stop a stuck / running one) */
/* DELETE /api/admin/uploads/:id          (lecture, file, quiz, attempts) */
/* ------------------------------------------------------------------ */
export const getUploads = async (req, res, next) => {
  try {
    const lectures = await Lecture.find()
      .select("title filename fileType fileSize status stage progress errorMessage createdAt user usage.estimatedCostUsd")
      .sort({ createdAt: -1 })
      .limit(300)
      .populate("user", "fullName email")
      .lean();

    res.json({
      success: true,
      uploads: lectures.map((lecture) => ({
        id: lecture._id,
        title: lecture.title,
        filename: lecture.filename,
        fileType: lecture.fileType,
        fileSize: lecture.fileSize,
        status: lecture.status,
        stage: lecture.stage,
        progress: lecture.status === "completed" ? 100 : Math.round(lecture.progress ?? 0),
        errorMessage: lecture.errorMessage || "",
        uploadedAt: lecture.createdAt,
        costUsd: lecture.usage?.estimatedCostUsd ?? 0,
        active: isJobActive(lecture._id),
        // null when the owner's account no longer exists
        owner: lecture.user ? { id: lecture.user._id, name: lecture.user.fullName, email: lecture.user.email } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const cancelUpload = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return bad(res, 404, "Upload not found");
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return bad(res, 404, "Upload not found");
    if (!["uploaded", "processing"].includes(lecture.status)) {
      return bad(res, 409, "This upload is not being processed");
    }

    cancelJob(lecture._id);
    lecture.status = "cancelled";
    lecture.stage = "cancelled";
    await lecture.save();

    securityLog("admin_upload_cancelled", req, { userId: String(req.userId), target: String(lecture._id) });
    res.json({ success: true, message: "Upload cancelled" });
  } catch (error) {
    next(error);
  }
};

export const deleteUpload = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return bad(res, 404, "Upload not found");
    const lecture = await Lecture.findById(req.params.id).select("filePath");
    if (!lecture) return bad(res, 404, "Upload not found");

    await deleteLectureData(lecture);

    securityLog("admin_upload_deleted", req, { userId: String(req.userId), target: String(lecture._id) });
    res.json({ success: true, message: "Upload deleted" });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/admin/logs                                                 */
/* One feed (newest first) of what students did (lectures, code,       */
/* diagrams, quizzes) and of the security audit log (sign-ins,         */
/* blocked requests, admin actions).                                   */
/* ------------------------------------------------------------------ */

// [what is shown as the action, what it is about]
const EVENT_LABELS = {
  login_success: ["Signed in", "Account"],
  login_failed: ["Sign-in failed", "Account"],
  login_blocked_locked: ["Sign-in blocked (account locked)", "Account"],
  login_blocked_inactive: ["Sign-in blocked (account deactivated)", "Account"],
  login_blocked_unverified: ["Sign-in blocked (email not verified)", "Account"],
  account_locked: ["Account locked after failed sign-ins", "Account"],
  google_login_failed: ["Google sign-in failed", "Account"],
  google_account_linked: ["Linked a Google account", "Account"],
  password_changed: ["Changed password", "Account"],
  password_change_failed: ["Password change failed", "Account"],
  password_reset_requested: ["Requested a password reset", "Account"],
  password_reset_completed: ["Reset password", "Account"],
  password_reset_failed: ["Password reset failed", "Account"],
  email_verified: ["Verified email address", "Account"],
  email_verification_failed: ["Email verification failed", "Account"],
  logout_all_devices: ["Signed out on all devices", "Account"],
  profile_updated: ["Updated profile", "Account"],
  data_export: ["Exported personal data", "Account"],
  account_deleted: ["Deleted account", "Account"],
  account_delete_failed: ["Account deletion failed", "Account"],
  admin_access_denied: ["Admin access denied", "Admin"],
  admin_user_updated: ["Updated a user", "Admin"],
  admin_user_deleted: ["Deleted a user", "Admin"],
  admin_upload_cancelled: ["Cancelled an upload", "Admin"],
  admin_upload_deleted: ["Deleted an upload", "Admin"],
  admin_code_cancelled: ["Cancelled a code request", "Admin"],
  admin_code_deleted: ["Deleted a code request", "Admin"],
  admin_diagram_cancelled: ["Cancelled a diagram request", "Admin"],
  admin_diagram_deleted: ["Deleted a diagram request", "Admin"],
  generation_rate_limited: ["Reached the hourly generation limit", "AI generation"],
  blocked_untrusted_origin: ["Request blocked (untrusted origin)", "Security"],
};
// "register" is left out: sign-ups are listed from the database (all of them, not just the recent log lines)
const SKIPPED_EVENTS = new Set(["register", "register_existing_email"]);
const FAILURE_PATTERN = /fail|blocked|denied|locked|limited/;

const humanize = (event) => {
  const text = String(event).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const resultOfStatus = (status) => (status === "failed" ? "Failed" : "Success");

export const getLogs = async (req, res, next) => {
  try {
    const [lectures, codeRequests, diagramRequests, attempts, signUps] = await Promise.all([
      Lecture.find()
        .select("title fileType status errorMessage createdAt user")
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("user", "fullName")
        .lean(),
      CodeGeneration.find()
        .select("title status errorMessage programmingLanguage createdAt user")
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("user", "fullName")
        .lean(),
      Diagram.find()
        .select("title status errorMessage diagramType createdAt user")
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("user", "fullName")
        .lean(),
      QuizAttempt.find()
        .select("score total createdAt user lecture")
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("user", "fullName")
        .populate("lecture", "title")
        .lean(),
      User.find().select("fullName email createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const withError = (text, error) => (error ? `${text} · ${error}` : text);
    const entries = [];

    for (const l of lectures) {
      entries.push({
        id: `lecture-${l._id}`,
        timestamp: l.createdAt,
        user: l.user?.fullName ?? "Deleted user",
        action: l.fileType === "TEXT" ? "Wrote a prompt" : `Uploaded a ${l.fileType} lecture`,
        entity: l.title,
        result: resultOfStatus(l.status),
        details: withError(`Status: ${l.status}`, l.errorMessage),
      });
    }
    for (const c of codeRequests) {
      entries.push({
        id: `code-${c._id}`,
        timestamp: c.createdAt,
        user: c.user?.fullName ?? "Deleted user",
        action: "Generated code",
        entity: c.title,
        result: resultOfStatus(c.status),
        details: withError(`Status: ${c.status} · ${c.programmingLanguage === "auto" ? "auto-detect" : c.programmingLanguage}`, c.errorMessage),
      });
    }
    for (const d of diagramRequests) {
      entries.push({
        id: `diagram-${d._id}`,
        timestamp: d.createdAt,
        user: d.user?.fullName ?? "Deleted user",
        action: "Generated a diagram",
        entity: d.title,
        result: resultOfStatus(d.status),
        details: withError(`Status: ${d.status} · ${d.diagramType === "auto" ? "auto-detect" : d.diagramType}`, d.errorMessage),
      });
    }
    for (const a of attempts) {
      entries.push({
        id: `quiz-${a._id}`,
        timestamp: a.createdAt,
        user: a.user?.fullName ?? "Deleted user",
        action: "Took a quiz",
        entity: a.lecture?.title ?? "Deleted lecture",
        result: "Success",
        details: `Score ${a.score}/${a.total}`,
      });
    }
    for (const u of signUps) {
      entries.push({
        id: `signup-${u._id}`,
        timestamp: u.createdAt,
        user: u.fullName,
        action: "Created an account",
        entity: "Account",
        result: "Success",
        details: "",
      });
    }

    // the audit log: the people it mentions are looked up by id in ONE query
    const events = readRecentSecurityEvents(400).filter((e) => !SKIPPED_EVENTS.has(e.event));
    const ids = new Set();
    for (const e of events) {
      for (const value of [e.userId, e.target]) if (validId(value)) ids.add(String(value));
    }
    const people = ids.size
      ? await User.find({ _id: { $in: [...ids] } }).select("fullName email").lean()
      : [];
    const nameOf = new Map(people.map((p) => [String(p._id), `${p.fullName} (${p.email})`]));

    events.forEach((e, index) => {
      const [action, entity] = EVENT_LABELS[e.event] ?? [humanize(e.event), "System"];
      const failed = FAILURE_PATTERN.test(e.event);
      const parts = [];
      if (e.target) parts.push(`Target: ${nameOf.get(String(e.target)) ?? `user ${e.target}`}`);
      if (e.changes) parts.push(`Changes: ${Object.entries(e.changes).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      if (e.reason) parts.push(`Reason: ${String(e.reason).replace(/_/g, " ")}`);
      if (e.method) parts.push(`Method: ${e.method}`);
      if (e.path) parts.push(`Path: ${e.path}`);
      if (Array.isArray(e.fields) && e.fields.length) parts.push(`Fields: ${e.fields.join(", ")}`);
      if (failed && e.ip) parts.push(`IP: ${e.ip}`); // an address is only shown where it helps spot abuse

      entries.push({
        id: `security-${index}-${e.time}`,
        timestamp: e.time,
        user: nameOf.get(String(e.userId)) ?? "—",
        action,
        entity,
        result: failed ? "Failed" : "Success",
        details: parts.join(" · "),
      });
    });

    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
      success: true,
      logs: entries.slice(0, 200).map((entry) => ({ ...entry, timestamp: new Date(entry.timestamp).toISOString() })),
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/* "Generate code" and "Generate diagram" requests                      */
/* GET    /api/admin/code        | /api/admin/diagrams        (newest 300) */
/* POST   /api/admin/code/:id/cancel | /api/admin/diagrams/:id/cancel   */
/* DELETE /api/admin/code/:id    | /api/admin/diagrams/:id              */
/* Like lectures, the admin sees who asked, how it went and what it     */
/* cost. The finished answer itself is not part of the list.            */
/* ------------------------------------------------------------------ */
function generationHandlers({ Model, noun, event, isActive, cancel, fields }) {
  const list = async (req, res, next) => {
    try {
      const rows = await Model.find()
        .select(["title", "language", "status", "stage", "progress", "errorMessage", "createdAt", "processingMs", "user", "usage", ...fields].join(" "))
        .sort({ createdAt: -1 })
        .limit(300)
        .populate("user", "fullName email")
        .lean();

      res.json({
        success: true,
        items: rows.map((row) => ({
          id: row._id,
          title: row.title,
          language: row.language,
          status: row.status,
          stage: row.stage,
          progress: row.status === "completed" ? 100 : Math.round(row.progress ?? 0),
          errorMessage: row.errorMessage || "",
          createdAt: row.createdAt,
          processingMs: row.processingMs ?? 0,
          tokens: (row.usage?.llmInputTokens ?? 0) + (row.usage?.llmOutputTokens ?? 0),
          costUsd: row.usage?.estimatedCostUsd ?? 0,
          active: isActive(row._id),
          // null when the owner's account no longer exists
          owner: row.user ? { id: row.user._id, name: row.user.fullName, email: row.user.email } : null,
          ...Object.fromEntries(fields.map((field) => [field, row[field]])),
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  const cancelOne = async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return bad(res, 404, `${noun} not found`);
      const doc = await Model.findById(req.params.id);
      if (!doc) return bad(res, 404, `${noun} not found`);
      if (!["queued", "processing"].includes(doc.status)) {
        return bad(res, 409, "This request is not being processed");
      }

      cancel(doc._id);
      doc.status = "cancelled";
      doc.stage = "cancelled";
      await doc.save();

      securityLog(`${event}_cancelled`, req, { userId: String(req.userId), request: String(doc._id) });
      res.json({ success: true, message: `${noun} cancelled` });
    } catch (error) {
      next(error);
    }
  };

  const remove = async (req, res, next) => {
    try {
      if (!validId(req.params.id)) return bad(res, 404, `${noun} not found`);
      const doc = await Model.findById(req.params.id).select("_id");
      if (!doc) return bad(res, 404, `${noun} not found`);

      cancel(doc._id); // stop it first, if it is running
      await Model.deleteOne({ _id: doc._id });

      securityLog(`${event}_deleted`, req, { userId: String(req.userId), request: String(doc._id) });
      res.json({ success: true, message: `${noun} deleted` });
    } catch (error) {
      next(error);
    }
  };

  return { list, cancelOne, remove };
}

const codeAdmin = generationHandlers({
  Model: CodeGeneration,
  noun: "Code request",
  event: "admin_code",
  isActive: isCodeJobActive,
  cancel: cancelCodeJob,
  fields: ["programmingLanguage"],
});
const diagramAdmin = generationHandlers({
  Model: Diagram,
  noun: "Diagram request",
  event: "admin_diagram",
  isActive: isDiagramJobActive,
  cancel: cancelDiagramJob,
  fields: ["diagramType", "detail"],
});

export const getCodeRequests = codeAdmin.list;
export const cancelCodeRequest = codeAdmin.cancelOne;
export const deleteCodeRequest = codeAdmin.remove;
export const getDiagramRequests = diagramAdmin.list;
export const cancelDiagramRequest = diagramAdmin.cancelOne;
export const deleteDiagramRequest = diagramAdmin.remove;

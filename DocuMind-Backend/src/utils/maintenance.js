import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Lecture from "../models/Lecture.js";
import CodeGeneration from "../models/CodeGeneration.js";
import Diagram from "../models/Diagram.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import User from "../models/User.js";
import { notifyUser } from "../services/notificationService.js";

// Called once at startup. Makes the indexes in MongoDB match the models.
//
// Why: an index that an OLD version of a model created (for example a unique index on `jobId`)
// stays in the database forever. It then rejects new documents with
//   E11000 duplicate key error ... index: jobId_1 dup key: { jobId: null }
// because every document without that field counts as `null`, and `null` may only exist once.
// syncIndexes() removes indexes that are not in the model any more and builds the missing ones.
export async function syncDatabaseIndexes() {
  await mongoose.connection.asPromise(); // wait until MongoDB is connected
  for (const model of [Lecture, Quiz, QuizAttempt, CodeGeneration, Diagram]) {
    try {
      const removed = await model.syncIndexes();
      if (removed?.length) console.log(`[db] ${model.modelName}: removed old index(es): ${removed.join(", ")}`);
    } catch (err) {
      console.error(`[db] could not update the indexes of ${model.modelName}:`, err.message);
    }
  }
}

// Called once at startup. Jobs only live in memory, so anything that was
// running (or waiting) when the server stopped must be marked as failed.
export async function recoverInterruptedJobs() {
  const message = "Processing was interrupted because the server restarted. Press Retry to continue.";
  const filter = { $or: [{ status: "processing" }, { status: "uploaded", stage: "queued" }] };
  const interrupted = await Lecture.find(filter).select("user title").lean();
  const result = await Lecture.updateMany(filter, {
    $set: { status: "failed", stage: "failed", errorMessage: message },
  });
  if (result.modifiedCount) console.log(`Marked ${result.modifiedCount} interrupted lecture(s) as failed`);
  for (const lecture of interrupted) {
    await notifyUser(lecture.user, {
      type: "failed",
      title: "Processing did not finish",
      message: `“${String(lecture.title).slice(0, 120)}” was interrupted because the server restarted. Open it and press Retry.`,
      lecture: lecture._id,
    });
  }
  await fs.rm(path.join(process.cwd(), "tmp"), { recursive: true, force: true }).catch(() => {});
}

// Same as above for "Generate code" requests: their jobs also live only in memory.
export async function recoverInterruptedCodeJobs() {
  const result = await CodeGeneration.updateMany(
    { status: { $in: ["queued", "processing"] } },
    {
      $set: {
        status: "failed",
        stage: "failed",
        errorMessage: "Generation was interrupted because the server restarted. Press Try again to continue.",
      },
    }
  );
  if (result.modifiedCount) console.log(`Marked ${result.modifiedCount} interrupted code request(s) as failed`);
}

// Same as above for "Generate diagram" requests.
export async function recoverInterruptedDiagramJobs() {
  const result = await Diagram.updateMany(
    { status: { $in: ["queued", "processing"] } },
    {
      $set: {
        status: "failed",
        stage: "failed",
        errorMessage: "Generation was interrupted because the server restarted. Press Try again to continue.",
      },
    }
  );
  if (result.modifiedCount) console.log(`Marked ${result.modifiedCount} interrupted diagram request(s) as failed`);
}

// Uploads of failed/cancelled jobs are kept for 24h so the student can retry,
// then deleted (the privacy promise on the upload page).
export async function sweepStaleFiles() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = await Lecture.find({
    filePath: { $nin: ["", null] },
    status: { $in: ["failed", "cancelled"] },
    updatedAt: { $lt: cutoff },
  }).select("filePath");

  for (const lecture of stale) {
    await fs.rm(path.join(process.cwd(), lecture.filePath), { force: true }).catch(() => {});
    await Lecture.updateOne({ _id: lecture._id }, { $set: { filePath: "" } });
  }
}

// Called once at startup. Email verification was added after the first accounts were created.
// Those accounts have no stored `emailVerified` value at all (new accounts always store one), so
// without this step every existing student and admin would be refused at sign-in until they
// verified an address that was already in use. Safe to run on every start: it only touches
// accounts that do not have the field yet.
export async function markExistingUsersVerified() {
  await mongoose.connection.asPromise();
  const result = await User.updateMany(
    { emailVerified: { $exists: false } },
    { $set: { emailVerified: true } },
    { timestamps: false } // keep each account's "last active" time (updatedAt) unchanged
  );
  if (result.modifiedCount) {
    console.log(`[db] Marked ${result.modifiedCount} existing account(s) as email-verified`);
  }
}


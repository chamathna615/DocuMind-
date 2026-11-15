import fs from "node:fs/promises";
import path from "node:path";
import Lecture from "../models/Lecture.js";
import Quiz from "../models/Quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Notification from "../models/Notification.js";
import CodeGeneration from "../models/CodeGeneration.js";
import Diagram from "../models/Diagram.js";
import { cancelJob } from "./jobQueue.js";
import { cancelCodeJob } from "./codeJobQueue.js";
import { cancelDiagramJob } from "./diagramJobQueue.js";

// Shared by "delete my account" and the admin's "delete user / delete upload", so that every kind of
// data a student creates is removed in ONE place (nothing is left behind when a new feature is added here).

const removeFile = (relativePath) =>
  relativePath ? fs.rm(path.join(process.cwd(), relativePath), { force: true }).catch(() => {}) : Promise.resolve();

/** Deletes one lecture with its uploaded file (if still on disk), quiz and quiz attempts. Stops its job first. */
export async function deleteLectureData(lecture) {
  cancelJob(lecture._id);
  await removeFile(lecture.filePath);
  await Promise.all([
    Quiz.deleteMany({ lecture: lecture._id }),
    QuizAttempt.deleteMany({ lecture: lecture._id }),
    Lecture.deleteOne({ _id: lecture._id }),
  ]);
}

/** Deletes everything that belongs to a user (but not the user document itself). */
export async function deleteUserData(userId) {
  const [lectures, codeRequests, diagrams] = await Promise.all([
    Lecture.find({ user: userId }).select("filePath"),
    CodeGeneration.find({ user: userId }).select("_id"),
    Diagram.find({ user: userId }).select("_id"),
  ]);

  // stop anything that is still running for this user
  lectures.forEach((lecture) => cancelJob(lecture._id));
  codeRequests.forEach((request) => cancelCodeJob(request._id));
  diagrams.forEach((diagram) => cancelDiagramJob(diagram._id));

  await Promise.all(lectures.map((lecture) => removeFile(lecture.filePath)));
  await Promise.all([
    Lecture.deleteMany({ user: userId }),
    Quiz.deleteMany({ user: userId }),
    QuizAttempt.deleteMany({ user: userId }),
    Notification.deleteMany({ user: userId }),
    CodeGeneration.deleteMany({ user: userId }),
    Diagram.deleteMany({ user: userId }),
  ]);
}

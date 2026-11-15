import { ai } from "../config/aiConfig.js";
import { processLecture } from "./processingService.js";

// Tiny in-process queue: at most `maxConcurrentJobs` lectures are processed
// at the same time, the rest wait their turn (protects CPU, RAM and your API budget).
const waiting = [];
const jobs = new Map(); // lectureId -> { controller, cancelled, options }
let running = 0;

export const isJobActive = (id) => jobs.has(String(id));

export function enqueue(id, options = {}) {
  id = String(id);
  if (jobs.has(id)) return false;
  jobs.set(id, { controller: new AbortController(), cancelled: false, options });
  waiting.push(id);
  pump();
  return true;
}

// Stops a queued or running job. Returns false if there is no such job.
export function cancelJob(id) {
  const job = jobs.get(String(id));
  if (!job) return false;
  job.cancelled = true;
  job.controller.abort();
  return true;
}

function pump() {
  while (running < ai.maxConcurrentJobs && waiting.length) {
    const id = waiting.shift();
    const job = jobs.get(id);
    running += 1;
    processLecture(id, {
      ...job.options,
      signal: job.controller.signal,
      isCancelled: () => job.cancelled,
    })
      .catch((err) => console.error(`[job ${id}] unexpected error`, err))
      .finally(() => {
        running -= 1;
        jobs.delete(id);
        pump();
      });
  }
}

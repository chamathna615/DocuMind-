import { ai } from "../config/aiConfig.js";
import { processCodeGeneration } from "./codeService.js";

// Same idea as jobQueue.js, but for "Generate code" requests: at most `maxConcurrentJobs` run at the
// same time, the rest wait their turn (protects your API budget). Code jobs have their own queue so
// they never block lecture processing and the other way round.
const waiting = [];
const jobs = new Map(); // id -> { controller, cancelled }
let running = 0;

export const isCodeJobActive = (id) => jobs.has(String(id));

export function enqueueCode(id) {
  id = String(id);
  if (jobs.has(id)) return false;
  jobs.set(id, { controller: new AbortController(), cancelled: false });
  waiting.push(id);
  pump();
  return true;
}

// Stops a queued or running job. Returns false if there is no such job.
export function cancelCodeJob(id) {
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
    processCodeGeneration(id, {
      signal: job.controller.signal,
      isCancelled: () => job.cancelled,
    })
      .catch((err) => console.error(`[code ${id}] unexpected error`, err))
      .finally(() => {
        running -= 1;
        jobs.delete(id);
        pump();
      });
  }
}

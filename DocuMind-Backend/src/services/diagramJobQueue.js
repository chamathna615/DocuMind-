import { ai } from "../config/aiConfig.js";
import { processDiagram } from "./diagramService.js";

// Same idea as codeJobQueue.js, but for "Generate diagram" requests: at most `maxConcurrentJobs` run at
// the same time, the rest wait their turn (protects your API budget).
const waiting = [];
const jobs = new Map(); // id -> { controller, cancelled }
let running = 0;

export const isDiagramJobActive = (id) => jobs.has(String(id));

export function enqueueDiagram(id) {
  id = String(id);
  if (jobs.has(id)) return false;
  jobs.set(id, { controller: new AbortController(), cancelled: false });
  waiting.push(id);
  pump();
  return true;
}

// Stops a queued or running job. Returns false if there is no such job.
export function cancelDiagramJob(id) {
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
    processDiagram(id, {
      signal: job.controller.signal,
      isCancelled: () => job.cancelled,
    })
      .catch((err) => console.error(`[diagram ${id}] unexpected error`, err))
      .finally(() => {
        running -= 1;
        jobs.delete(id);
        pump();
      });
  }
}

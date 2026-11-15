import "dotenv/config"; // server.js calls dotenv too, but ES imports run first

const num = (value, fallback) => {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const MB = 1024 * 1024;

export const ai = {
  sttModel: process.env.STT_MODEL || "gpt-transcribe",
  llmModel: process.env.LLM_MODEL || "gpt-6-luna",
  // Model used by the "Generate code" page. Same model as everything else unless CODE_MODEL is set.
  codeModel: process.env.CODE_MODEL || process.env.LLM_MODEL || "gpt-6-luna",
  // Model used by the "Generate diagram" page (it writes Mermaid code). Same default as above.
  diagramModel: process.env.DIAGRAM_MODEL || process.env.LLM_MODEL || "gpt-6-luna",
  // "" = model default. Try "low" for faster / cheaper generation.
  reasoningEffort: process.env.LLM_REASONING_EFFORT || "",

  // Audio is cut into pieces of this length before transcription.
  chunkSeconds: num(process.env.CHUNK_SECONDS, 300),
  // Neighbouring chunks overlap by this many seconds so no word is lost at a cut.
  // The duplicated words are removed again by transcriptCleaner.js
  overlapSeconds: num(process.env.CHUNK_OVERLAP_SECONDS, 8),
  sttConcurrency: num(process.env.STT_CONCURRENCY, 4),
  maxDurationSec: num(process.env.MAX_DURATION_MIN, 240) * 60,

  // Server protection (important when you pay per request)
  // How many AI requests of ONE lecture run at the same time (more = faster, but may hit rate limits).
  llmConcurrency: num(process.env.LLM_CONCURRENCY, 8),
  maxConcurrentJobs: num(process.env.MAX_CONCURRENT_JOBS, 2),
  maxActiveJobsPerUser: num(process.env.MAX_ACTIVE_JOBS_PER_USER, 2),
  maxSourceChars: 1_500_000,

  // Used only for the cost ESTIMATES shown to admins. Update if prices change.
  price: {
    sttPerMinute: num(process.env.PRICE_STT_PER_MIN, 0.0045),
    llmInputPerMillion: num(process.env.PRICE_LLM_INPUT_PER_M, 0.1),
    llmOutputPerMillion: num(process.env.PRICE_LLM_OUTPUT_PER_M, 0.5),
  },
};

// Same limits as the upload screen
export const uploadLimits = { mp3: 100 * MB, mp4: 500 * MB, pdf: 50 * MB };

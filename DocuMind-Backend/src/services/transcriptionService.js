import fs from "node:fs";
import { getOpenAI } from "./openaiClient.js";
import { ai } from "../config/aiConfig.js";
import { mapLimit } from "../utils/async.js";

// Returns the raw transcript of every chunk, in order (the cleaning step joins them).
export async function transcribeChunks(files, { contextHint = "", signal, onProgress } = {}) {
  const openai = getOpenAI();
  let done = 0;

  return mapLimit(
    files,
    ai.sttConcurrency,
    async (file) => {
      const res = await openai.audio.transcriptions.create(
        {
          model: ai.sttModel,
          file: fs.createReadStream(file),
          ...(contextHint ? { prompt: contextHint } : {}),
        },
        { signal }
      );
      done += 1;
      onProgress?.(done, files.length);
      return (res.text || "").trim();
    },
    signal
  );
}

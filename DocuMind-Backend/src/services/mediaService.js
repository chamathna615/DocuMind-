import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { UserError, CancelledError } from "../utils/userError.js";
import { mapLimit } from "../utils/async.js";

const run = promisify(execFile);

const wasAborted = (err, signal) =>
  signal?.aborted || err?.name === "AbortError" || err?.code === "ABORT_ERR";

export async function getDurationSec(file, signal) {
  try {
    const { stdout } = await run(
      ffprobe.path,
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
      { signal }
    );
    const duration = parseFloat(stdout);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("bad duration");
    return duration;
  } catch (err) {
    if (wasAborted(err, signal)) throw new CancelledError();
    throw new UserError("This file could not be read. It may be corrupted or contain no audio.");
  }
}

/**
 * 1. Converts any MP3/MP4 into ONE speech-optimised MP3 (mono, 16 kHz, 32 kbps, video dropped).
 * 2. Slices it into chunks of `chunkSeconds` (+ `overlapSeconds` extra at the end of every chunk)
 *    with a fast stream copy. One request to the transcription API is limited to 25 MB;
 *    a 5-minute chunk is only about 1.2 MB.
 *
 * Returns { files: string[], overlapped: boolean }
 */
export async function extractChunks(inputFile, outDir, { chunkSeconds, overlapSeconds = 0, signal }) {
  await fs.mkdir(outDir, { recursive: true });
  const full = path.join(outDir, "full.mp3");

  try {
    await run(
      ffmpegPath,
      ["-y", "-i", inputFile, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", full],
      { maxBuffer: 20 * 1024 * 1024, signal }
    );
  } catch (err) {
    if (wasAborted(err, signal)) throw new CancelledError();
    throw new UserError("Could not extract audio. Does this file contain an audio track?");
  }

  const duration = await getDurationSec(full, signal);

  // short recording: one chunk, nothing to overlap
  if (duration <= chunkSeconds + overlapSeconds) return { files: [full], overlapped: false };

  const starts = [0];
  // a final tail shorter than the overlap is already contained in the previous chunk
  for (let s = chunkSeconds; duration - s > overlapSeconds + 3; s += chunkSeconds) starts.push(s);

  const files = await mapLimit(
    starts,
    4,
    async (start, i) => {
      const out = path.join(outDir, `chunk_${String(i).padStart(3, "0")}.mp3`);
      try {
        await run(
          ffmpegPath,
          ["-y", "-ss", String(start), "-t", String(chunkSeconds + overlapSeconds), "-i", full, "-c", "copy", out],
          { signal }
        );
      } catch (err) {
        if (wasAborted(err, signal)) throw new CancelledError();
        throw new UserError("Could not prepare the audio for transcription.");
      }
      return out;
    },
    signal
  );

  await fs.rm(full, { force: true }).catch(() => {});
  return { files, overlapped: overlapSeconds > 0 };
}

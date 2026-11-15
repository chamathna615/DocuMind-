import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Security audit log: one JSON object per line in logs/security.log (and the console).
 *
 * Privacy rules for this log:
 *  - NEVER pass passwords, tokens, Google credentials or lecture content.
 *  - Emails are not stored in clear text; use hashEmail() when no user id exists.
 *  - Rotate/delete the file regularly (it is rotated automatically at 5 MB).
 */
const logDir = path.join(process.cwd(), "logs");
const logFile = path.join(logDir, "security.log");
const MAX_BYTES = 5 * 1024 * 1024;

try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  /* logging must never crash the app */
}

export const hashEmail = (email) =>
  crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex").slice(0, 12);

export const clientIp = (req) => req?.ip || req?.socket?.remoteAddress || "unknown";

const rotateIfNeeded = () => {
  try {
    if (fs.statSync(logFile).size > MAX_BYTES) fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    /* file does not exist yet */
  }
};

/**
 * The newest entries of the audit log (oldest first), for the admin "Activity logs" page.
 * Only the end of each file is read, so a 5 MB log never has to be loaded completely.
 */
export function readRecentSecurityEvents(limit = 400) {
  const tail = (file, maxBytes) => {
    try {
      const { size } = fs.statSync(file);
      const length = Math.min(size, maxBytes);
      const fd = fs.openSync(file, "r");
      try {
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, size - length);
        const text = buffer.toString("utf8");
        // when the start of the file was skipped, the first line is cut in half: drop it
        return size > length ? text.slice(text.indexOf("\n") + 1) : text;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return ""; // the file does not exist yet
    }
  };

  const lines = `${tail(`${logFile}.1`, 256 * 1024)}\n${tail(logFile, 512 * 1024)}`.split("\n");
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && entry.event && entry.time) events.push(entry);
    } catch {
      /* a damaged line is skipped */
    }
  }
  return events.slice(-limit);
}

export function securityLog(event, req, details = {}) {
  try {
    const entry = { time: new Date().toISOString(), event, ip: req ? clientIp(req) : undefined, ...details };
    const line = JSON.stringify(entry);
    console.log(`[security] ${line}`);
    rotateIfNeeded();
    fs.appendFile(logFile, `${line}\n`, () => {});
  } catch {
    /* logging must never crash the app */
  }
}

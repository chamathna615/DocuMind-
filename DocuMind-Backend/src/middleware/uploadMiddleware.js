import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";

const uploadFolder = path.join(process.cwd(), "uploads");

// Create the uploads folder automatically if it does not exist.
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadFolder);
  },

  // The stored name is random: it never contains user input, so it can't be guessed,
  // can't collide with another student's file and can't be used for path tricks.
  // (Only the extension is kept, and the file filter below already limited it to .mp3/.mp4/.pdf.)
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extension}`);
  },
});

// Each extension is only accepted together with its own MIME types.
// (Browsers report different MIME types for the same MP3: audio/mpeg, audio/mp3, ...)
const allowedTypes = {
  ".mp3": ["audio/mpeg", "audio/mp3", "audio/x-mpeg", "audio/mpeg3"],
  ".mp4": ["video/mp4", "audio/mp4"],
  ".pdf": ["application/pdf"],
};

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes[extension]?.includes(file.mimetype)) {
    callback(null, true);
  } else {
    const error = new Error("Only MP3, MP4, and PDF files are allowed");
    error.statusCode = 400;
    callback(error);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // hard limit 500 MB (MP3 100 MB / PDF 50 MB are checked in the controller)
    files: 1,
  },
});

/* ------------------------------------------------------------------ */
/* Content check. The file name and MIME type come from the browser    */
/* and can be faked, so look at the first bytes of the real file       */
/* ("magic bytes"). Runs after multer, before the controller.          */
/* ------------------------------------------------------------------ */
const MP4_FIRST_ATOMS = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide"]);

const looksLikeMp3 = (buffer) => {
  if (buffer.subarray(0, 3).toString("latin1") === "ID3") return true; // tagged MP3
  // otherwise look for an MPEG audio frame header near the start of the file
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      const version = (buffer[i + 1] >> 3) & 0x03;
      const layer = (buffer[i + 1] >> 1) & 0x03;
      if (version !== 0x01 && layer !== 0x00) return true;
    }
  }
  return false;
};

const contentMatches = (extension, buffer) => {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (extension === ".mp4") return MP4_FIRST_ATOMS.has(buffer.subarray(4, 8).toString("latin1"));
  if (extension === ".mp3") return looksLikeMp3(buffer);
  return false;
};

export const verifyUploadContent = async (req, res, next) => {
  const file = req.file;
  if (!file) return next();

  const discard = () => fs.promises.rm(file.path, { force: true }).catch(() => {});

  try {
    const handle = await fs.promises.open(file.path, "r");
    const buffer = Buffer.alloc(4096);
    let bytesRead = 0;
    try {
      ({ bytesRead } = await handle.read(buffer, 0, buffer.length, 0));
    } finally {
      await handle.close();
    }

    const extension = path.extname(file.originalname).toLowerCase();
    if (bytesRead > 0 && contentMatches(extension, buffer.subarray(0, bytesRead))) {
      return next();
    }

    await discard();
    return res.status(400).json({
      success: false,
      message: "The file content does not match its type. Please upload a real MP3, MP4 or PDF file.",
    });
  } catch (error) {
    await discard();
    next(error);
  }
};

export default upload;

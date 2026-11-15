export const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

// Which field caused a MongoDB duplicate key error (E11000)?
// Normally in err.keyPattern; older drivers / servers only mention it in the message:
//   "E11000 duplicate key error collection: db.users index: email_1 dup key: { email: "a@b.com" }"
const duplicateField = (err) => {
  const fromKeys = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0];
  if (fromKeys) return fromKeys;
  const message = String(err.message ?? "");
  return (
    message.match(/dup key: \{\s*"?([A-Za-z0-9_.]+)"?\s*:/)?.[1] ??
    message.match(/index:\s*([A-Za-z0-9_.]+?)_-?\d+\b/)?.[1] ??
    // no details at all: in the users collection the only unique field is the email
    (/collection:\s*[^\s.]+\.users\b/.test(message) ? "email" : undefined)
  );
};

export const errorHandler = (err, req, res, next) => {
  console.error(err);

  // MongoDB duplicate key error. Only a duplicate EMAIL means "Email already in use";
  // any other unique index (an old index left in the database, for example) is a different problem.
  if (err.code === 11000) {
    const field = duplicateField(err);
    if (field === "email") {
      return res.status(409).json({ success: false, message: "Email already in use" });
    }
    return res.status(409).json({
      success: false,
      message: "This could not be saved because it conflicts with existing data. Please try again.",
      ...(process.env.NODE_ENV !== "production" && field ? { field } : {}), // helps while developing
    });
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }

  // Invalid ObjectId in a URL (e.g. /api/lectures/abc)
  if (err.name === "CastError") {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  // Upload errors from multer (file too large, too many files, ...)
  if (err.name === "MulterError") {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message;
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.statusCode && err.statusCode < 500 ? err.message : err.userMessage || "Server error",
  });
};


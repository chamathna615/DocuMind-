// Must be the FIRST import: ES module imports are hoisted, so loading .env here guarantees
// that every other file already sees the values (NODE_ENV, GOOGLE_CLIENT_ID, ...).
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import { notFound, errorHandler } from "./src/middleware/errorMiddleware.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import lectureRoutes from "./src/routes/lectureRoutes.js";
import codeRoutes from "./src/routes/codeRoutes.js";
import diagramRoutes from "./src/routes/diagramRoutes.js";
import quizRoutes from "./src/routes/quizRoutes.js";
import analyticsRoutes from "./src/routes/analyticsRoutes.js";
import notificationRoutes from "./src/routes/notificationRoutes.js";
import { securityHeaders, sanitizeInput, originGuard, apiLimiter } from "./src/middleware/securityMiddleware.js";
import {
  syncDatabaseIndexes,
  recoverInterruptedJobs,
  recoverInterruptedCodeJobs,
  recoverInterruptedDiagramJobs,
  sweepStaleFiles,
  markExistingUsersVerified,
} from "./src/utils/maintenance.js";

const isProd = process.env.NODE_ENV === "production";

/* ---------------- startup security checks ---------------- */
// A weak or placeholder JWT secret lets anyone forge a login token, so refuse to start with one.
const jwtSecret = process.env.JWT_SECRET || "";
if (jwtSecret.length < 32 || jwtSecret.startsWith("change-me")) {
  console.error(
    "[security] JWT_SECRET is missing, too short (< 32 characters) or still the placeholder.\n" +
      "           Generate a strong one with:\n" +
      "           node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n" +
      "           and put it in your .env file."
  );
  process.exit(1);
}

connectDB();

const app = express();

app.disable("x-powered-by"); // don't advertise "Express" to attackers

// Behind a reverse proxy / hosting platform (Render, Railway, Nginx...) set TRUST_PROXY=1 so that
// the real client IP is used for rate limiting and the audit log.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true" ? 1 : trustProxy);
}

const configuredOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);
if (!isProd) {
  // while developing, http://127.0.0.1:5173 is the same app as http://localhost:5173
  configuredOrigins.forEach((o) => {
    if (o.includes("//localhost")) allowedOrigins.add(o.replace("//localhost", "//127.0.0.1"));
  });
}
const allowedOriginList = [...allowedOrigins];

app.use(securityHeaders);
app.use(
  cors({
    origin: allowedOriginList,
    credentials: true, // allow the httpOnly cookie to be sent
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  })
);
app.use("/api", apiLimiter);
app.use(express.json({ limit: "1mb" })); // explicit size cap, big enough for edited notes
app.use(cookieParser());
app.use(sanitizeInput); // strips MongoDB operators ($ne, $gt, ...) and prototype-pollution keys
app.use("/api", originGuard(allowedOriginList)); // CSRF: only our own front end may change data

app.get("/api/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? "DocuMind API is running" : "API is running but MongoDB is NOT connected",
    database: dbConnected ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/lectures", lectureRoutes);
app.use("/api/code", codeRoutes);
app.use("/api/diagrams", diagramRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api", quizRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Only mention it when NODE_ENV is missing altogether; NODE_ENV=development is a deliberate choice.
  if (!process.env.NODE_ENV) {
    console.log("[security] NODE_ENV is not set: running in development mode (cookies are not marked Secure and HSTS is off).");
  }
  // Only a problem in production. In development the emails are printed in this terminal when they are sent.
  if (isProd && process.env.REQUIRE_EMAIL_VERIFICATION !== "false" && !process.env.SMTP_HOST) {
    console.log(
      "[email] WARNING: SMTP_HOST is not set, so verification and password-reset emails CANNOT be sent. Configure SMTP_* in .env."
    );
  }

  // 1) remove outdated database indexes (fixes "E11000 duplicate key ... jobId_1")
  // 2) jobs live in memory, so anything that was running before a restart is marked as failed
  syncDatabaseIndexes()
    .then(() => markExistingUsersVerified())
    .then(() => recoverInterruptedJobs())
    .then(() => recoverInterruptedCodeJobs())
    .then(() => recoverInterruptedDiagramJobs())
    .catch((err) => console.error("Startup database tasks failed:", err));
  // Delete leftover uploads of failed/cancelled jobs after 24h (now and every 6h).
  sweepStaleFiles().catch((err) => console.error("Cleanup failed:", err));
  setInterval(() => sweepStaleFiles().catch((err) => console.error("Cleanup failed:", err)), 6 * 60 * 60 * 1000);
});

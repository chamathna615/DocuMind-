import rateLimit from "express-rate-limit";
import { securityLog } from "../utils/securityLog.js";

const isProd = process.env.NODE_ENV === "production";

/* ------------------------------------------------------------------ */
/* 1) Security response headers (a small, dependency-free "helmet")    */
/* ------------------------------------------------------------------ */
export const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // never guess a file type
  res.setHeader("X-Frame-Options", "DENY"); // the API can't be framed (clickjacking)
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // This server only returns JSON/PDF/ZIP, so no page content is ever allowed to load or run.
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  // Student data and downloads must never be stored by browsers/proxies/CDNs.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
};

/* ------------------------------------------------------------------ */
/* 2) Input sanitising: NoSQL operator injection + prototype pollution */
/*    e.g. { "email": { "$ne": null } } would otherwise match anyone.  */
/* ------------------------------------------------------------------ */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const strip = (value, depth = 0) => {
  if (!value || typeof value !== "object" || depth > 12) return;
  if (Array.isArray(value)) {
    value.forEach((item) => strip(item, depth + 1));
    return;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || FORBIDDEN_KEYS.has(key)) {
      delete value[key];
    } else {
      strip(value[key], depth + 1);
    }
  }
};

export const sanitizeInput = (req, res, next) => {
  strip(req.body);
  strip(req.query);
  strip(req.params);
  next();
};

/* ------------------------------------------------------------------ */
/* 3) CSRF protection: state-changing requests that come from a        */
/*    browser must originate from one of our own front-end origins.    */
/*    (The session cookie may be SameSite=None in production.)         */
/* ------------------------------------------------------------------ */
export const originGuard = (allowedOrigins) => (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next(); // curl / server-to-server clients do not send an Origin header
  if (allowedOrigins.includes(origin)) return next();
  // While developing, Vite moves to another port (5174, 5175...) when 5173 is busy: any local page is fine.
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return next();

  securityLog("blocked_untrusted_origin", req, { origin: String(origin).slice(0, 200), method: req.method });
  return res.status(403).json({ success: false, message: "Request blocked: untrusted origin" });
};

/* ------------------------------------------------------------------ */
/* 4) Rate limits                                                      */
/* ------------------------------------------------------------------ */
const tooMany = (message) => ({ success: false, message });

// Whole API, per IP: stops floods and scraping, generous enough for normal use.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_MIN) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany("Too many requests. Please slow down and try again in a moment."),
});

// Expensive actions (uploads, AI generation), per signed-in USER, so a shared campus
// network is not punished for one person's behaviour. Protects the OpenAI budget.
// Must be placed AFTER the `protect` middleware.
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.MAX_GENERATIONS_PER_HOUR) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.userId}`,
  handler: (req, res) => {
    securityLog("generation_rate_limited", req, { userId: String(req.userId) });
    res.status(429).json(tooMany("You have reached the hourly limit for generating content. Please try again later."));
  },
});

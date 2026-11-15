import crypto from "node:crypto";

// One-time tokens for email verification and password reset.
//  - The raw token (256 random bits) is only ever sent by email.
//  - Only its SHA-256 hash is stored in the database, so a leaked database cannot be used
//    to reset anyone's password or verify anyone's email.

export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

export const createToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
};

// Tokens are always 64 hex characters; anything else is rejected before touching the database.
export const isTokenFormat = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

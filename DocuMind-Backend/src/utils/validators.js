// Small, dependency-free input validators shared by the controllers.

export const asString = (value) => (typeof value === "string" ? value : "");

export const isValidEmail = (email) =>
  typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

// Passwords that are always rejected (compared in lower case).
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "welcome1",
  "welcome123",
  "letmein123",
  "abc12345",
  "abcd1234",
  "changeme",
]);

/**
 * Returns an error message, or null when the password is acceptable.
 * Matches the frontend rules (8+ chars, upper, lower, digit) and adds:
 *  - a 72-byte maximum (bcrypt silently ignores everything after 72 bytes)
 *  - a small common-password blocklist
 *  - no using the first part of the email address inside the password
 */
export function validatePassword(password, { email } = {}) {
  if (typeof password !== "string" || !password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "Password is too long (maximum 72 bytes)";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include an uppercase letter, a lowercase letter and a number";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Please choose a different one";
  }
  const emailName = typeof email === "string" ? email.split("@")[0].toLowerCase() : "";
  if (emailName.length >= 4 && password.toLowerCase().includes(emailName)) {
    return "Password must not contain your email name";
  }
  return null;
}

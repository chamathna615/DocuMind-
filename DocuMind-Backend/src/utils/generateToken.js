import jwt from "jsonwebtoken";

/**
 * Signs a JWT for a given user id.
 * @param {string} userId
 * @param {boolean} rememberMe - if true, uses the longer expiry window
 * @param {number} tokenVersion - the user's current tokenVersion; bumping it revokes older tokens
 */
const generateToken = (userId, rememberMe = false, tokenVersion = 0) => {
  const expiresIn = rememberMe
    ? process.env.JWT_EXPIRES_IN_REMEMBER || "30d"
    : process.env.JWT_EXPIRES_IN || "1d";

  // The algorithm is pinned (and pinned again when verifying) to rule out algorithm-confusion attacks.
  return jwt.sign({ id: userId, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: "HS256",
  });
};

export default generateToken;

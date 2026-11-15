import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
  let token;

  if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (err) {
    return res.status(401).json({ success: false, message: "Not authorized, token invalid or expired" });
  }

  try {
    const user = await User.findById(decoded.id).select("status tokenVersion").lean();
    if (!user || user.status !== "active") {
      return res.status(401).json({ success: false, message: "Account is inactive or no longer exists" });
    }

    // The password was changed (or the user chose "sign out everywhere") after this token was issued.
    // Tokens created before this feature existed have no version and count as version 0.
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ success: false, message: "Session expired, please sign in again" });
    }

    req.userId = decoded.id;
    next();
  } catch (err) {
    next(err);
  }
};

export default protect;

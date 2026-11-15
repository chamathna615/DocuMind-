import User from "../models/User.js";
import { securityLog } from "../utils/securityLog.js";

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role status").lean();

    if (!user || user.role !== "admin") {
      securityLog("admin_access_denied", req, { userId: String(req.userId), path: req.originalUrl.split("?")[0] });
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export default requireAdmin;

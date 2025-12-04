import jwt from "jsonwebtoken";
import { queryOne } from "../db/client.js";

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const { password, ...rest } = userRecord;
  return {
    ...rest,
    _id: userRecord.id,
  };
};

export const authAdmin = async (req, res, next) => {
  const token = req.cookies.token || req.cookies.sellerToken;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Admin authorization required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded.id) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

    const userRecord = await queryOne(
      `
        SELECT id, name, email, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.id]
    );

    if (!userRecord) {
      return res
        .status(401)
        .json({ success: false, message: "Admin privileges required" });
    }

    if (!userRecord.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Admin account inactive" });
    }

    if (userRecord.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Admin privileges required" });
    }

    req.user = userRecord.id;
    req.userRole = userRecord.role;
    req.currentUser = sanitizeUser(userRecord);

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

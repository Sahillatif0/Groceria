import jwt from "jsonwebtoken";
import { queryOne } from "../db/client.js";

export const authUser = async (req, res, next) => {
  const { token } = req.cookies;
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "User is unauthorized" });
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decodedToken.id) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

    const userRecord = await queryOne(
      `
        SELECT id, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decodedToken.id]
    );

    if (!userRecord) {
      return res
        .status(401)
        .json({ success: false, message: "User is unauthorized" });
    }

    if (!userRecord.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "User account is inactive" });
    }

    req.user = userRecord.id;
    req.userRole = userRecord.role;

    next();
  } catch (error) {
    res
      .status(401)
      .json({ success: false, message: "Access token expired or invalid" });
  }
};

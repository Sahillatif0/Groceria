import jwt from "jsonwebtoken";
import { UserModel } from "../models/index.js";

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

    const userRecord = await UserModel.findById(decodedToken.id)
      .select({ role: 1, isActive: 1 })
      .lean();

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

    req.user = userRecord._id.toString();
    req.userRole = userRecord.role;

    next();
  } catch (error) {
    res
      .status(401)
      .json({ success: false, message: "Access token expired or invalid" });
  }
};

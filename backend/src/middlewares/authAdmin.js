import jwt from "jsonwebtoken";
import { UserModel } from "../models/index.js";

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const payload = userRecord.toObject ? userRecord.toObject() : userRecord;
  const { password, ...rest } = payload;
  const id = payload._id?.toString?.() ?? payload.id?.toString?.();
  return {
    ...rest,
    _id: id,
    id,
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

    const userRecord = await UserModel.findById(decoded.id).lean();

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

    req.user = userRecord._id.toString();
    req.userRole = userRecord.role;
    req.currentUser = sanitizeUser(userRecord);

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

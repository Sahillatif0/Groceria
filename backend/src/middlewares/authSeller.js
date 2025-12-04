import jwt from "jsonwebtoken";
<<<<<<< HEAD
import { queryOne } from "../db/client.js";
=======
import { UserModel } from "../models/index.js";
>>>>>>> f3a43296fa90500cfcdf6cafabe0669f32899963

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

export const authSeller = async (req, res, next) => {
  const token = req.cookies.sellerToken || req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "User unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!decoded.id) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token payload" });
    }

<<<<<<< HEAD
    const userRecord = await queryOne(
      `
        SELECT id, name, email, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [decoded.id]
    );
=======
    const userRecord = await UserModel.findById(decoded.id).lean();
>>>>>>> f3a43296fa90500cfcdf6cafabe0669f32899963

    if (!userRecord || !userRecord.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Seller account inactive" });
    }

    if (!["seller", "admin"].includes(userRecord.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    req.user = userRecord._id.toString();
    req.userRole = userRecord.role;
    req.currentUser = sanitizeUser(userRecord);

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

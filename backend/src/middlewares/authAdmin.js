import jwt from "jsonwebtoken";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

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

    const [userRecord] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

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

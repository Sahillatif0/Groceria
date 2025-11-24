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

    const [userRecord] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

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

    req.user = userRecord.id;
    req.userRole = userRecord.role;
    req.currentUser = sanitizeUser(userRecord);

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

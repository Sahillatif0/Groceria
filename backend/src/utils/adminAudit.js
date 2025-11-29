import { AdminAuditLogModel } from "../models/index.js";
import { isValidObjectId, toObjectId } from "./validators.js";

export const recordAdminAction = async ({
  adminId,
  action,
  targetType,
  targetId = null,
  metadata = {},
}) => {
  try {
    await AdminAuditLogModel.create({
      admin: isValidObjectId(adminId) ? toObjectId(adminId) : null,
      action,
      targetType,
      targetId,
      metadata,
    });
  } catch (error) {
    console.error("Failed to record admin audit log", error.message);
  }
};

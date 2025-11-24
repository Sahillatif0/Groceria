import { getDb } from "../db/client.js";
import { adminAuditLogs } from "../db/schema.js";

export const recordAdminAction = async ({
  adminId,
  action,
  targetType,
  targetId = null,
  metadata = {},
}) => {
  try {
    await getDb()
      .insert(adminAuditLogs)
      .values({
        adminId: adminId ?? null,
        action,
        targetType,
        targetId,
        metadata,
      });
  } catch (error) {
    console.error("Failed to record admin audit log", error.message);
  }
};

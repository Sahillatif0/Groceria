import { query } from "../db/client.js";

export const recordAdminAction = async ({
  adminId,
  action,
  targetType,
  targetId = null,
  metadata = {},
}) => {
  try {
    await query(
      `
        INSERT INTO admin_audit_logs (
          admin_id,
          action,
          target_type,
          target_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [adminId ?? null, action, targetType, targetId, metadata]
    );
  } catch (error) {
    console.error("Failed to record admin audit log", error.message);
  }
};

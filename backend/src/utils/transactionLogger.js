import { getDb } from "../db/client.js";
import { transactionLogs } from "../db/schema.js";

const buildMetadata = ({ actorId, actorRole, description, payload }) => {
  const meta = {};
  if (actorId) meta.actorId = actorId;
  if (actorRole) meta.actorRole = actorRole;
  if (description) meta.description = description;
  if (payload !== undefined) meta.payload = payload;
  return Object.keys(meta).length ? meta : null;
};

export const recordTransactionLog = async ({
  tableName,
  recordId = null,
  operation,
  actorId = null,
  actorRole = null,
  description = null,
  beforeData = null,
  afterData = null,
  payload,
}) => {
  if (!tableName || !operation) {
    console.warn("transaction log skipped: tableName and operation required");
    return;
  }

  try {
    const metadata = buildMetadata({
      actorId,
      actorRole,
      description,
      payload,
    });

    await getDb()
      .insert(transactionLogs)
      .values({
        tableName,
        recordId,
        operation,
        beforeData: beforeData ?? null,
        afterData: afterData ?? metadata,
      });
  } catch (error) {
    console.error("Failed to record transaction log", error.message);
  }
};

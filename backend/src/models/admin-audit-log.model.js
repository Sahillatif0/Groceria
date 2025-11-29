import mongoose from "mongoose";

const { Schema } = mongoose;

const adminAuditLogSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AdminAuditLogModel =
  mongoose.models.AdminAuditLog ??
  mongoose.model("AdminAuditLog", adminAuditLogSchema);

import mongoose from "mongoose";

const { Schema } = mongoose;

const transactionLogSchema = new Schema(
  {
    tableName: { type: String, required: true, trim: true },
    recordId: { type: Schema.Types.ObjectId, default: null },
    operation: { type: String, required: true, trim: true },
    beforeData: { type: Schema.Types.Mixed, default: null },
    afterData: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const TransactionLogModel =
  mongoose.models.TransactionLog ??
  mongoose.model("TransactionLog", transactionLogSchema);

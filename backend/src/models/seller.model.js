import mongoose from "mongoose";
import { SELLER_STATUSES } from "./constants.js";

const { Schema } = mongoose;

const sellerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    status: { type: String, enum: SELLER_STATUSES, default: "pending" },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const SellerModel =
  mongoose.models.Seller ?? mongoose.model("Seller", sellerSchema);

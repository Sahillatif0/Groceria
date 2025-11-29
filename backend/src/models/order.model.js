import mongoose from "mongoose";

const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    address: { type: Schema.Types.ObjectId, ref: "Address", required: true },
    status: { type: String, default: "Order Placed", trim: true },
    paymentType: { type: String, required: true, trim: true },
    isPaid: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const OrderModel =
  mongoose.models.Order ?? mongoose.model("Order", orderSchema);

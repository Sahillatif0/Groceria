import mongoose from "mongoose";

const { Schema } = mongoose;

const orderItemSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const OrderItemModel =
  mongoose.models.OrderItem ?? mongoose.model("OrderItem", orderItemSchema);

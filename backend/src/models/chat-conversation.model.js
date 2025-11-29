import mongoose from "mongoose";

const { Schema } = mongoose;

const chatConversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },
  },
  { timestamps: true }
);

export const ChatConversationModel =
  mongoose.models.ChatConversation ??
  mongoose.model("ChatConversation", chatConversationSchema);

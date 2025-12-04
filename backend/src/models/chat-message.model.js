import mongoose from "mongoose";
import { USER_ROLES } from "./constants.js";

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    type: { type: String, enum: ["image"], default: "image" },
    width: { type: Number },
    height: { type: Number },
    bytes: { type: Number },
    publicId: { type: String },
  },
  { _id: false }
);

const chatMessageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "ChatConversation",
      required: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: USER_ROLES, required: true },
    body: { type: String, trim: true, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    readByUser: { type: Boolean, default: false },
    readBySeller: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ChatMessageModel =
  mongoose.models.ChatMessage ??
  mongoose.model("ChatMessage", chatMessageSchema);

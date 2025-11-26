import express from "express";
import { authUser } from "../middlewares/authUser.middleware.js";
import { authSeller } from "../middlewares/authSeller.js";
import {
  getSellerConversationMessages,
  getUserConversationMessages,
  listSellerConversations,
  listUserConversations,
  sendSellerMessage,
  sendUserMessage,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/user", authUser, listUserConversations);
router.get("/user/:conversationId/messages", authUser, getUserConversationMessages);
router.post("/user/send", authUser, sendUserMessage);

router.get("/seller", authSeller, listSellerConversations);
router.get("/seller/:conversationId/messages", authSeller, getSellerConversationMessages);
router.post("/seller/send", authSeller, sendSellerMessage);

export default router;

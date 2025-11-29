import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { chatConversations } from "../db/schema.js";
import { isValidUuid } from "../utils/validators.js";

let ioInstance = null;

export const attachChatServer = (io) => {
  ioInstance = io;
};

const getChatServer = () => {
  if (!ioInstance) {
    throw new Error("Chat server is not attached");
  }
  return ioInstance;
};

export const userRoom = (userId) => `user:${userId}`;
export const conversationRoom = (conversationId) => `conversation:${conversationId}`;

const ensureConversationAccess = async ({ conversationId, userId }) => {
  const [conversation] = await getDb()
    .select({
      id: chatConversations.id,
      userId: chatConversations.userId,
      sellerId: chatConversations.sellerId,
    })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (conversation.userId !== userId && conversation.sellerId !== userId) {
    throw new Error("Access denied");
  }

  return conversation;
};

export const registerChatHandlers = (socket) => {
  socket.on("chat:join", async (payload, callback) => {
    try {
      const conversationId = payload?.conversationId;
      if (!conversationId || !isValidUuid(conversationId)) {
        throw new Error("Invalid conversation id");
      }

      await ensureConversationAccess({
        conversationId,
        userId: socket.data.user?.id,
      });

      socket.join(conversationRoom(conversationId));
      if (typeof callback === "function") {
        callback({ success: true });
      }
    } catch (error) {
      if (typeof callback === "function") {
        callback({ success: false, message: error.message });
      } else {
        socket.emit("chat:error", { message: error.message });
      }
    }
  });

  socket.on("chat:leave", (payload, callback) => {
    const conversationId = payload?.conversationId;
    if (!conversationId) {
      if (typeof callback === "function") {
        callback({ success: false, message: "Conversation id required" });
      }
      return;
    }

    socket.leave(conversationRoom(conversationId));
    if (typeof callback === "function") {
      callback({ success: true });
    }
  });
};

export const emitConversationUpdate = (conversation) => {
  if (!conversation?.id) {
    return;
  }

  const io = getChatServer();
  const participantIds = [conversation.userId, conversation.sellerId].filter(Boolean);

  participantIds.forEach((participantId) => {
    io.to(userRoom(participantId)).emit("chat:conversation", conversation);
  });
};

export const emitChatMessage = ({ conversation, message }) => {
  if (!conversation?.id || !message?.id) {
    return;
  }

  const io = getChatServer();

  emitConversationUpdate(conversation);
  io.to(conversationRoom(conversation.id)).emit("chat:message", {
    conversationId: conversation.id,
    message,
  });
};

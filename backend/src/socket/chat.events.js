import { ChatConversationModel } from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";

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
  const conversation = await ChatConversationModel.findById(conversationId)
    .select({ user: 1, seller: 1 })
    .lean();

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const userIdString = userId?.toString();
  if (
    userIdString !== conversation.user?.toString() &&
    userIdString !== conversation.seller?.toString()
  ) {
    throw new Error("Access denied");
  }

  return conversation;
};

export const registerChatHandlers = (socket) => {
  socket.on("chat:join", async (payload, callback) => {
    try {
      const conversationId = payload?.conversationId;
      if (!conversationId || !isValidObjectId(conversationId)) {
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

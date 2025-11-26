import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../context/AppContext";

const ChatModal = ({ product, onClose }) => {
  const { axios, user, socket, connectSocket } = UseAppContext();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const messageListRef = useRef(null);

  const sellerId = product?.sellerId ?? null;
  const productId = product?._id ?? product?.id ?? null;

  const sellerLabel = useMemo(() => {
    const fromConversation = conversation?.seller?.name;
    return fromConversation || "Seller";
  }, [conversation?.seller?.name]);

  const loadMessages = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) {
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const { data } = await axios.get(
          `/api/chat/user/${conversationId}/messages`
        );

        if (!data.success) {
          toast.error(data.message || "Failed to load messages");
          return;
        }

        setConversation(data.conversation ?? null);
        setMessages(data.messages ?? []);
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [axios]
  );

  const loadConversation = useCallback(async () => {
    if (!sellerId) {
      toast.error("Seller chat is not available for this product");
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.get("/api/chat/user");
      if (!data.success) {
        toast.error(data.message || "Failed to load conversations");
        return;
      }

      const existing = (data.conversations || []).find((item) => {
        if (item.sellerId !== sellerId) {
          return false;
        }

        if (!productId) {
          return true;
        }

        if (!item.productId) {
          return true;
        }

        return item.productId === productId;
      });

      if (existing) {
        setConversation(existing);
        await loadMessages(existing.id, { silent: true });
      } else {
        setConversation(null);
        setMessages([]);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  }, [axios, sellerId, productId, loadMessages]);

  const currentUserId = useMemo(() => user?._id || user?.id || null, [user]);

  const isOwnMessage = useCallback(
    (message) => currentUserId && message.senderId === currentUserId,
    [currentUserId]
  );

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    connectSocket?.();
  }, [connectSocket]);

  const socketConnected = socket?.connected ?? false;

  const scrollToBottom = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!socketConnected || !conversation?.id) {
      return;
    }

    socket.emit("chat:join", { conversationId: conversation.id });

    return () => {
      if (socket.connected) {
        socket.emit("chat:leave", { conversationId: conversation.id });
      }
    };
  }, [conversation?.id, socket, socketConnected]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConversationUpdate = (incomingConversation) => {
      if (!incomingConversation) {
        return;
      }

      if (conversation?.id === incomingConversation.id) {
        setConversation(incomingConversation);
      } else if (!conversation) {
        const matchesSeller =
          incomingConversation.sellerId === sellerId;
        const matchesProduct =
          !productId || incomingConversation.productId === productId;

        if (matchesSeller && matchesProduct) {
          setConversation(incomingConversation);
          loadMessages(incomingConversation.id, { silent: true });
        }
      }
    };

    const handleMessage = ({ conversationId, message }) => {
      if (!conversationId || !message) {
        return;
      }

      if (!conversation || conversation.id !== conversationId) {
        loadConversation();
        return;
      }

      setMessages((previous) => {
        if (previous.some((existing) => existing.id === message.id)) {
          return previous;
        }
        return [...previous, message];
      });

      if (!isOwnMessage(message)) {
        loadMessages(conversationId, { silent: true });
      }
    };

    socket.on("chat:conversation", handleConversationUpdate);
    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:conversation", handleConversationUpdate);
      socket.off("chat:message", handleMessage);
    };
  }, [conversation, isOwnMessage, loadConversation, loadMessages, productId, sellerId, socket]);

  const handleSend = useCallback(
    async (event) => {
      event?.preventDefault?.();

      if (!messageBody.trim()) {
        return;
      }

      if (!sellerId) {
        toast.error("Seller chat is unavailable");
        return;
      }

      try {
        setSending(true);
        const payload = {
          message: messageBody.trim(),
          conversationId: conversation?.id,
          productId,
          sellerId,
        };

        const { data } = await axios.post("/api/chat/user/send", payload);
        if (!data.success) {
          toast.error(data.message || "Failed to send message");
          return;
        }

        const updatedConversation = data.conversation ?? null;
        const nextConversationId =
          updatedConversation?.id ?? conversation?.id ?? null;

        setConversation(updatedConversation);
        setMessageBody("");

        if (nextConversationId) {
          loadMessages(nextConversationId, { silent: true });
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message);
      } finally {
        setSending(false);
      }
    },
    [axios, conversation?.id, loadMessages, messageBody, productId, sellerId]
  );

  const closeModal = (event) => {
    event?.stopPropagation?.();
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
      onClick={closeModal}
    >
      <div
        className="flex h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <p className="text-lg font-semibold">Chat with {sellerLabel}</p>
            {product?.name ? (
              <p className="text-xs text-gray-500">Product: {product.name}</p>
            ) : null}
          </div>
          <button
            onClick={closeModal}
            className="text-sm text-gray-500 hover:text-gray-800"
            type="button"
          >
            Close
          </button>
        </div>

        <div
          ref={messageListRef}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {loading && !messages.length ? (
            <p className="text-sm text-gray-500">Loading conversation…</p>
          ) : null}

          {!loading && !messages.length ? (
            <p className="text-sm text-gray-500">
              No messages yet. Say hello to start the conversation.
            </p>
          ) : null}

          <div className="flex flex-col gap-3">
            {messages.map((message) => {
              const mine = isOwnMessage(message);
              return (
                <div
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      mine
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.body}
                    </p>
                    <p className="mt-1 text-[10px] opacity-80">
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-gray-200 bg-gray-50 px-4 py-3"
        >
          <div className="flex items-end gap-3">
            <textarea
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              rows={2}
              placeholder="Write your message…"
              className="flex-1 resize-none rounded-md border border-gray-300 p-3 text-sm outline-primary"
              disabled={sending || !sellerId}
            ></textarea>
            <button
              type="submit"
              disabled={sending || !messageBody.trim() || !sellerId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary-dull disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatModal;

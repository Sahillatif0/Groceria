import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const Messages = () => {
  const { axios, socket, connectSocket } = UseAppContext();
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const messageListRef = useRef(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const sortByUpdatedAt = useCallback((items) => {
    return [...items].sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }, []);

  const upsertConversation = useCallback(
    (incomingConversation) => {
      if (!incomingConversation?.id) {
        return;
      }

      setConversations((previous) => {
        const others = previous.filter(
          (conversation) => conversation.id !== incomingConversation.id
        );
        return sortByUpdatedAt([...others, incomingConversation]);
      });
    },
    [sortByUpdatedAt]
  );

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const { data } = await axios.get("/api/chat/seller");
      if (!data.success) {
        toast.error(data.message || "Unable to load conversations");
        return;
      }

      const incoming = sortByUpdatedAt(data.conversations ?? []);
      setConversations(incoming);

      if (!activeConversationId && data.conversations?.length) {
        setActiveConversationId(data.conversations[0].id);
      }

      if (
        activeConversationId &&
        !incoming.some((conv) => conv.id === activeConversationId)
      ) {
        setActiveConversationId(incoming[0]?.id ?? null);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setLoadingConversations(false);
    }
  }, [activeConversationId, axios, sortByUpdatedAt]);

  const loadMessages = useCallback(
    async (conversationId, { silent = false } = {}) => {
      if (!conversationId) {
        setMessages([]);
        return;
      }

      if (!silent) {
        setLoadingMessages(true);
      }

      try {
        const { data } = await axios.get(
          `/api/chat/seller/${conversationId}/messages`
        );

        if (!data.success) {
          toast.error(data.message || "Unable to load messages");
          return;
        }

        setMessages(data.messages ?? []);
        if (data.conversation) {
          upsertConversation(data.conversation);
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message);
      } finally {
        if (!silent) {
          setLoadingMessages(false);
        }
      }
    },
    [axios, upsertConversation]
  );

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(activeConversationId);
  }, [activeConversationId, loadMessages]);

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
    if (!socketConnected || !activeConversationId) {
      return;
    }

    socket.emit("chat:join", { conversationId: activeConversationId });

    return () => {
      if (socket.connected) {
        socket.emit("chat:leave", { conversationId: activeConversationId });
      }
    };
  }, [activeConversationId, socket, socketConnected]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConversationUpdate = (incomingConversation) => {
      upsertConversation(incomingConversation);
      if (!activeConversationId && incomingConversation?.id) {
        setActiveConversationId(incomingConversation.id);
      }
    };

    const handleMessage = ({ conversationId, message }) => {
      if (!conversationId || !message) {
        return;
      }

      if (conversationId !== activeConversationId) {
        return;
      }

      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) {
          return previous;
        }
        return [...previous, message];
      });

      if (message.senderId !== activeConversation?.sellerId) {
        loadMessages(conversationId, { silent: true });
      }
    };

    socket.on("chat:conversation", handleConversationUpdate);
    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:conversation", handleConversationUpdate);
      socket.off("chat:message", handleMessage);
    };
  }, [activeConversation, activeConversationId, loadMessages, socket, upsertConversation]);

  const handleSend = useCallback(
    async (event) => {
      event?.preventDefault?.();

      if (!activeConversationId) {
        toast.error("Select a conversation first");
        return;
      }

      if (!messageBody.trim()) {
        return;
      }

      try {
        setSending(true);
        const { data } = await axios.post("/api/chat/seller/send", {
          conversationId: activeConversationId,
          message: messageBody.trim(),
        });

        if (!data.success) {
          toast.error(data.message || "Unable to send message");
          return;
        }

        if (data.conversation) {
          upsertConversation(data.conversation);
        }
        loadMessages(activeConversationId, { silent: true });
        setMessageBody("");
      } catch (error) {
        toast.error(error?.response?.data?.message || error.message);
      } finally {
        setSending(false);
      }
    },
    [activeConversationId, axios, loadMessages, messageBody, upsertConversation]
  );

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col bg-white md:flex-row">
      <div className="md:w-72 md:border-r md:border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-lg font-semibold">Customer Chats</p>
          <p className="text-xs text-gray-500">
            {loadingConversations
              ? "Loading conversations…"
              : `${conversations.length} conversation${
                  conversations.length === 1 ? "" : "s"
                }`}
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto md:max-h-none">
          {loadingConversations && conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              Loading conversations…
            </p>
          ) : null}

          {!loadingConversations && conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500">
              No conversations yet. Customers can reach out from product pages.
            </p>
          ) : null}

          <ul className="flex flex-row gap-3 overflow-x-auto px-3 py-3 md:flex-col md:gap-0 md:px-0">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const customerName =
                conversation.customer?.name ?? "Customer";
              const lastSnippet = conversation.lastMessage?.body ?? "";

              return (
                <li key={conversation.id} className="md:px-0 md:py-0">
                  <button
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition md:rounded-none md:border-0 md:border-b md:px-4 md:py-3 ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary md:border-l-4"
                        : "border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <p className="text-sm font-semibold">{customerName}</p>
                    {conversation.product?.name ? (
                      <p className="text-xs text-gray-500">
                        {conversation.product.name}
                      </p>
                    ) : null}
                    {lastSnippet ? (
                      <p className="text-xs text-gray-500 truncate">
                        {lastSnippet}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        {activeConversation ? (
          <>
            <div className="border-b border-gray-200 px-4 py-3">
              <p className="text-lg font-semibold">
                {activeConversation.customer?.name ?? "Customer"}
              </p>
              {activeConversation.product?.name ? (
                <p className="text-xs text-gray-500">
                  Product: {activeConversation.product.name}
                </p>
              ) : null}
            </div>

            <div
              ref={messageListRef}
              className="flex-1 overflow-y-auto px-4 py-4"
            >
              {loadingMessages && messages.length === 0 ? (
                <p className="text-sm text-gray-500">Loading messages…</p>
              ) : null}

              {!loadingMessages && messages.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No messages yet. Reply to start the conversation.
                </p>
              ) : null}

              <div className="flex flex-col gap-3">
                {messages.map((message) => {
                  const mine =
                    message.senderId === activeConversation.sellerId;
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
                  rows={2}
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Write your reply…"
                  className="flex-1 resize-none rounded-md border border-gray-300 p-3 text-sm outline-primary"
                  disabled={sending}
                ></textarea>
                <button
                  type="submit"
                  disabled={sending || !messageBody.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-secondary-dull disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-gray-500">
            {loadingConversations
              ? "Loading conversations…"
              : "Select a conversation to view messages."}
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;

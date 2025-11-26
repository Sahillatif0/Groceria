import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  chatConversations,
  chatMessages,
  products,
  users,
} from "../db/schema.js";
import { isValidUuid } from "../utils/validators.js";
import { emitChatMessage } from "../socket/chat.events.js";

const db = () => getDb();

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const { password, ...rest } = userRecord;
  return {
    ...rest,
    _id: userRecord.id,
  };
};

const sanitizeProduct = (productRecord) => {
  if (!productRecord) {
    return null;
  }

  return {
    id: productRecord.id,
    _id: productRecord.id,
    name: productRecord.name,
    offerPrice: productRecord.offerPrice,
    image: productRecord.image,
  };
};

const formatMessage = (messageRecord) => ({
  id: messageRecord.id,
  conversationId: messageRecord.conversationId,
  senderId: messageRecord.senderId,
  senderRole: messageRecord.senderRole,
  body: messageRecord.body,
  readByUser: messageRecord.readByUser,
  readBySeller: messageRecord.readBySeller,
  createdAt: messageRecord.createdAt,
});

const formatConversation = (conversationRecord, extras = {}) => {
  const payload = {
    id: conversationRecord.id,
    userId: conversationRecord.userId,
    sellerId: conversationRecord.sellerId,
    productId: conversationRecord.productId,
    createdAt: conversationRecord.createdAt,
    updatedAt: conversationRecord.updatedAt,
    lastMessage: extras.lastMessage ? formatMessage(extras.lastMessage) : null,
  };

  if (Object.prototype.hasOwnProperty.call(extras, "customer")) {
    payload.customer = sanitizeUser(extras.customer);
  }

  if (Object.prototype.hasOwnProperty.call(extras, "seller")) {
    payload.seller = sanitizeUser(extras.seller);
  }

  if (Object.prototype.hasOwnProperty.call(extras, "product")) {
    payload.product = sanitizeProduct(extras.product);
  }

  return payload;
};

const getLastMessage = async (conversationId) => {
  const [latest] = await db()
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);

  return latest ?? null;
};

const loadConversationWithMeta = async (conversationId) => {
  const [conversation] = await db()
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return null;
  }

  const [[customer], [seller], productRecord, lastMessage] = await Promise.all([
    db()
      .select()
      .from(users)
      .where(eq(users.id, conversation.userId))
      .limit(1),
    db()
      .select()
      .from(users)
      .where(eq(users.id, conversation.sellerId))
      .limit(1),
    conversation.productId
      ? db()
          .select()
          .from(products)
          .where(eq(products.id, conversation.productId))
          .limit(1)
          .then((records) => records[0] ?? null)
      : Promise.resolve(null),
    getLastMessage(conversationId),
  ]);

  return formatConversation(conversation, {
    customer,
    seller,
    product: productRecord,
    lastMessage,
  });
};

const findExistingConversation = async ({
  userId,
  sellerId,
  productId,
}) => {
  const filters = [eq(chatConversations.userId, userId), eq(chatConversations.sellerId, sellerId)];

  if (productId) {
    filters.push(eq(chatConversations.productId, productId));
  } else {
    filters.push(isNull(chatConversations.productId));
  }

  const [conversation] = await db()
    .select()
    .from(chatConversations)
    .where(and(...filters))
    .limit(1);

  return conversation ?? null;
};

const resolveSellerAndProduct = async ({ sellerId, productId }) => {
  let resolvedSellerId = sellerId ?? null;
  let resolvedProductId = productId ?? null;

  if (resolvedProductId) {
    if (!isValidUuid(resolvedProductId)) {
      throw new Error("Invalid product id");
    }

    const [productRecord] = await db()
      .select()
      .from(products)
      .where(eq(products.id, resolvedProductId))
      .limit(1);

    if (!productRecord) {
      throw new Error("Product not found");
    }

    if (!productRecord.sellerId) {
      throw new Error("Product is not associated with a seller");
    }

    resolvedSellerId = productRecord.sellerId;
    resolvedProductId = productRecord.id;
  }

  if (!resolvedSellerId) {
    throw new Error("Seller id is required");
  }

  if (!isValidUuid(resolvedSellerId)) {
    throw new Error("Invalid seller id");
  }

  const [sellerRecord] = await db()
    .select()
    .from(users)
    .where(eq(users.id, resolvedSellerId))
    .limit(1);

  if (!sellerRecord || !["seller", "admin"].includes(sellerRecord.role)) {
    throw new Error("Seller account not found");
  }

  if (!sellerRecord.isActive) {
    throw new Error("Seller account is inactive");
  }

  return {
    sellerId: sellerRecord.id,
    productId: resolvedProductId,
    sellerRecord,
  };
};

const ensureConversation = async ({ userId, sellerId, productId }) => {
  if (userId === sellerId) {
    throw new Error("Cannot create a conversation with yourself");
  }

  let conversation = await findExistingConversation({
    userId,
    sellerId,
    productId,
  });

  if (conversation) {
    return conversation;
  }

  const [created] = await db()
    .insert(chatConversations)
    .values({
      userId,
      sellerId,
      productId: productId ?? null,
    })
    .returning();

  return created;
};

const updateConversationTimestamp = async (conversationId) => {
  await db()
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));
};

export const listUserConversations = async (req, res) => {
  try {
    const conversations = await db()
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, req.user))
      .orderBy(desc(chatConversations.updatedAt));

    if (!conversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const sellerIds = [...new Set(conversations.map((item) => item.sellerId))];
    const productIds = [...new Set(conversations.map((item) => item.productId).filter(Boolean))];

    const [[customerRecord], sellerRecords, productRecords, lastMessageEntries] = await Promise.all([
      db()
        .select()
        .from(users)
        .where(eq(users.id, req.user))
        .limit(1),
      sellerIds.length
        ? db().select().from(users).where(inArray(users.id, sellerIds))
        : Promise.resolve([]),
      productIds.length
        ? db().select().from(products).where(inArray(products.id, productIds))
        : Promise.resolve([]),
      Promise.all(
        conversations.map(async (conversation) => ({
          conversationId: conversation.id,
          lastMessage: await getLastMessage(conversation.id),
        }))
      ),
    ]);

    const sellerMap = new Map(sellerRecords.map((record) => [record.id, record]));
    const productMap = new Map(productRecords.map((record) => [record.id, record]));
    const lastMessageMap = new Map(
      lastMessageEntries.map(({ conversationId, lastMessage }) => [conversationId, lastMessage])
    );

    const formatted = conversations.map((conversation) =>
      formatConversation(conversation, {
        customer: customerRecord,
        seller: sellerMap.get(conversation.sellerId) ?? null,
        product: productMap.get(conversation.productId ?? "") ?? null,
        lastMessage: lastMessageMap.get(conversation.id) ?? null,
      })
    );

    return res.json({ success: true, conversations: formatted });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidUuid(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation id" });
    }

    const [conversation] = await db()
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.userId !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    const messages = await db()
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);

    await db()
      .update(chatMessages)
      .set({ readByUser: true })
      .where(eq(chatMessages.conversationId, conversationId));

    const conversationMeta = await loadConversationWithMeta(conversationId);

    return res.json({
      success: true,
      conversation: conversationMeta,
      messages: messages.map(formatMessage),
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const sendUserMessage = async (req, res) => {
  try {
    const { conversationId, message, productId, sellerId } = req.body;

    if (!message || !message.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Message body is required" });
    }

    if (sellerId && sellerId === req.user) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot start a chat with yourself" });
    }

    let conversation = null;
    let resolvedSellerId = sellerId ?? null;
    let resolvedProductId = productId ?? null;

    if (conversationId) {
      if (!isValidUuid(conversationId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid conversation id" });
      }

      const [existingConversation] = await db()
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1);

      if (!existingConversation || existingConversation.userId !== req.user) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found" });
      }

      conversation = existingConversation;
      resolvedSellerId = conversation.sellerId;
      resolvedProductId = conversation.productId;
    } else {
      const resolution = await resolveSellerAndProduct({
        sellerId: resolvedSellerId,
        productId: resolvedProductId,
      });

      resolvedSellerId = resolution.sellerId;
      resolvedProductId = resolution.productId;

      if (resolvedSellerId === req.user) {
        return res.status(400).json({
          success: false,
          message: "Cannot start a chat with your own seller account",
        });
      }

      try {
        conversation = await ensureConversation({
          userId: req.user,
          sellerId: resolvedSellerId,
          productId: resolvedProductId,
        });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
    }

    if (conversation.userId === conversation.sellerId) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation participants" });
    }

    const [newMessage] = await db()
      .insert(chatMessages)
      .values({
        conversationId: conversation.id,
        senderId: req.user,
        senderRole: req.userRole,
        body: message.trim(),
        readByUser: true,
        readBySeller: false,
      })
      .returning();

    const formattedMessage = formatMessage(newMessage);

    await updateConversationTimestamp(conversation.id);

    const conversationMeta = await loadConversationWithMeta(conversation.id);

    emitChatMessage({
      conversation: conversationMeta,
      message: formattedMessage,
    });

    return res.status(201).json({
      success: true,
      conversation: conversationMeta,
      message: formattedMessage,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const listSellerConversations = async (req, res) => {
  try {
    const conversations = await db()
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.sellerId, req.user))
      .orderBy(desc(chatConversations.updatedAt));

    const validConversations = conversations.filter(
      (conversation) => conversation.userId !== conversation.sellerId
    );

    if (!validConversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const userIds = [...new Set(validConversations.map((item) => item.userId))];
    const productIds = [...new Set(validConversations.map((item) => item.productId).filter(Boolean))];

    const [sellerRecord, customerRecords, productRecords, lastMessageEntries] = await Promise.all([
      db()
        .select()
        .from(users)
        .where(eq(users.id, req.user))
        .limit(1)
        .then((records) => records[0] ?? null),
      userIds.length
        ? db().select().from(users).where(inArray(users.id, userIds))
        : Promise.resolve([]),
      productIds.length
        ? db().select().from(products).where(inArray(products.id, productIds))
        : Promise.resolve([]),
      Promise.all(
        validConversations.map(async (conversation) => ({
          conversationId: conversation.id,
          lastMessage: await getLastMessage(conversation.id),
        }))
      ),
    ]);

    const customerMap = new Map(customerRecords.map((record) => [record.id, record]));
    const productMap = new Map(productRecords.map((record) => [record.id, record]));
    const lastMessageMap = new Map(
      lastMessageEntries.map(({ conversationId, lastMessage }) => [conversationId, lastMessage])
    );

    const formatted = validConversations.map((conversation) =>
      formatConversation(conversation, {
        customer: customerMap.get(conversation.userId) ?? null,
        seller: sellerRecord,
        product: productMap.get(conversation.productId ?? "") ?? null,
        lastMessage: lastMessageMap.get(conversation.id) ?? null,
      })
    );

    return res.json({ success: true, conversations: formatted });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellerConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidUuid(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation id" });
    }

    const [conversation] = await db()
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.sellerId !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    if (conversation.userId === conversation.sellerId) {
      return res.status(400).json({
        success: false,
        message: "Cannot load messages for your own seller account",
      });
    }

    const messages = await db()
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt);

    await db()
      .update(chatMessages)
      .set({ readBySeller: true })
      .where(eq(chatMessages.conversationId, conversationId));

    const conversationMeta = await loadConversationWithMeta(conversationId);

    return res.json({
      success: true,
      conversation: conversationMeta,
      messages: messages.map(formatMessage),
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const sendSellerMessage = async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!message || !message.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Message body is required" });
    }

    if (!conversationId || !isValidUuid(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Conversation id required" });
    }

    const [conversation] = await db()
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.sellerId !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    if (conversation.userId === conversation.sellerId) {
      return res.status(400).json({
        success: false,
        message: "Cannot send messages to your own seller account",
      });
    }

    const [newMessage] = await db()
      .insert(chatMessages)
      .values({
        conversationId,
        senderId: req.user,
        senderRole: req.userRole,
        body: message.trim(),
        readByUser: false,
        readBySeller: true,
      })
      .returning();

    const formattedMessage = formatMessage(newMessage);

    await updateConversationTimestamp(conversationId);

    const conversationMeta = await loadConversationWithMeta(conversationId);

    emitChatMessage({
      conversation: conversationMeta,
      message: formattedMessage,
    });

    return res.status(201).json({
      success: true,
      conversation: conversationMeta,
      message: formattedMessage,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

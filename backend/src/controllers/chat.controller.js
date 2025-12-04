import { query, queryMany, queryOne } from "../db/client.js";
import { isValidUuid } from "../utils/validators.js";
import { emitChatMessage } from "../socket/chat.events.js";

const USER_COLUMNS = `
  id,
  name,
  email,
  role,
  is_active,
  created_at,
  updated_at
`;

const PRODUCT_COLUMNS = `
  id,
  name,
  offer_price,
  image,
  seller_id
`;

const CONVERSATION_COLUMNS = `
  id,
  user_id,
  seller_id,
  product_id,
  created_at,
  updated_at
`;

const MESSAGE_COLUMNS = `
  id,
  conversation_id,
  sender_id,
  sender_role,
  body,
  read_by_user,
  read_by_seller,
  created_at
`;

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

const getLastMessage = (conversationId) =>
  queryOne(
    `
      SELECT ${MESSAGE_COLUMNS}
      FROM chat_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [conversationId]
  );

const loadConversationWithMeta = async (conversationId) => {
  const conversation = await queryOne(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM chat_conversations
      WHERE id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  if (!conversation) {
    return null;
  }

  const [customer, seller, productRecord, lastMessage] = await Promise.all([
    queryOne(
      `
        SELECT ${USER_COLUMNS}
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [conversation.userId]
    ),
    queryOne(
      `
        SELECT ${USER_COLUMNS}
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [conversation.sellerId]
    ),
    conversation.productId
      ? queryOne(
          `
            SELECT ${PRODUCT_COLUMNS}
            FROM products
            WHERE id = $1
            LIMIT 1
          `,
          [conversation.productId]
        )
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

const findExistingConversation = ({ userId, sellerId, productId }) => {
  if (productId) {
    return queryOne(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE user_id = $1
          AND seller_id = $2
          AND product_id = $3
        LIMIT 1
      `,
      [userId, sellerId, productId]
    );
  }

  return queryOne(
    `
      SELECT ${CONVERSATION_COLUMNS}
      FROM chat_conversations
      WHERE user_id = $1
        AND seller_id = $2
        AND product_id IS NULL
      LIMIT 1
    `,
    [userId, sellerId]
  );
};

const resolveSellerAndProduct = async ({ sellerId, productId }) => {
  let resolvedSellerId = sellerId ?? null;
  let resolvedProductId = productId ?? null;

  if (resolvedProductId) {
    if (!isValidUuid(resolvedProductId)) {
      throw new Error("Invalid product id");
    }

    const productRecord = await queryOne(
      `
        SELECT ${PRODUCT_COLUMNS}
        FROM products
        WHERE id = $1
        LIMIT 1
      `,
      [resolvedProductId]
    );

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

  const sellerRecord = await queryOne(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [resolvedSellerId]
  );

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

  const conversation = await findExistingConversation({
    userId,
    sellerId,
    productId,
  });

  if (conversation) {
    return conversation;
  }

  return queryOne(
    `
      INSERT INTO chat_conversations (user_id, seller_id, product_id)
      VALUES ($1, $2, $3)
      RETURNING ${CONVERSATION_COLUMNS}
    `,
    [userId, sellerId, productId ?? null]
  );
};

const updateConversationTimestamp = (conversationId) =>
  query(
    `
      UPDATE chat_conversations
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [conversationId]
  );

const fetchUsersByIds = (ids = []) => {
  if (!ids.length) {
    return Promise.resolve([]);
  }

  return queryMany(
    `
      SELECT ${USER_COLUMNS}
      FROM users
      WHERE id = ANY($1::uuid[])
    `,
    [ids]
  );
};

const fetchProductsByIds = (ids = []) => {
  if (!ids.length) {
    return Promise.resolve([]);
  }

  return queryMany(
    `
      SELECT ${PRODUCT_COLUMNS}
      FROM products
      WHERE id = ANY($1::uuid[])
    `,
    [ids]
  );
};

export const listUserConversations = async (req, res) => {
  try {
    const conversations = await queryMany(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `,
      [req.user]
    );

    if (!conversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const sellerIds = Array.from(new Set(conversations.map((item) => item.sellerId)));
    const productIds = Array.from(
      new Set(conversations.map((item) => item.productId).filter(Boolean))
    );

    const [customerRecord, sellerRecords, productRecords, lastMessageEntries] = await Promise.all([
      queryOne(
        `
          SELECT ${USER_COLUMNS}
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [req.user]
      ),
      fetchUsersByIds(sellerIds),
      fetchProductsByIds(productIds),
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

    const conversation = await queryOne(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
      `,
      [conversationId]
    );

    if (!conversation || conversation.userId !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    const messages = await queryMany(
      `
        SELECT ${MESSAGE_COLUMNS}
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    await query(
      `
        UPDATE chat_messages
        SET read_by_user = true
        WHERE conversation_id = $1
      `,
      [conversationId]
    );

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
    const trimmedMessage = message?.trim();

    if (!trimmedMessage) {
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

      const existingConversation = await queryOne(
        `
          SELECT ${CONVERSATION_COLUMNS}
          FROM chat_conversations
          WHERE id = $1
          LIMIT 1
        `,
        [conversationId]
      );

      if (!existingConversation || existingConversation.userId !== req.user) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found" });
      }

      conversation = existingConversation;
      resolvedSellerId = conversation.sellerId;
      resolvedProductId = conversation.productId;
    } else {
      let resolution;
      try {
        resolution = await resolveSellerAndProduct({
          sellerId: resolvedSellerId,
          productId: resolvedProductId,
        });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }

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

    const newMessage = await queryOne(
      `
        INSERT INTO chat_messages (
          conversation_id,
          sender_id,
          sender_role,
          body,
          read_by_user,
          read_by_seller
        )
        VALUES ($1, $2, $3, $4, true, false)
        RETURNING ${MESSAGE_COLUMNS}
      `,
      [conversation.id, req.user, req.userRole, trimmedMessage]
    );

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
    const conversations = await queryMany(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE seller_id = $1
        ORDER BY updated_at DESC
      `,
      [req.user]
    );

    const validConversations = conversations.filter(
      (conversation) => conversation.userId !== conversation.sellerId
    );

    if (!validConversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const userIds = Array.from(new Set(validConversations.map((item) => item.userId)));
    const productIds = Array.from(
      new Set(validConversations.map((item) => item.productId).filter(Boolean))
    );

    const [sellerRecord, customerRecords, productRecords, lastMessageEntries] = await Promise.all([
      queryOne(
        `
          SELECT ${USER_COLUMNS}
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [req.user]
      ),
      fetchUsersByIds(userIds),
      fetchProductsByIds(productIds),
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

    const conversation = await queryOne(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
      `,
      [conversationId]
    );

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

    const messages = await queryMany(
      `
        SELECT ${MESSAGE_COLUMNS}
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );

    await query(
      `
        UPDATE chat_messages
        SET read_by_seller = true
        WHERE conversation_id = $1
      `,
      [conversationId]
    );

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
    const trimmedMessage = message?.trim();

    if (!trimmedMessage) {
      return res
        .status(400)
        .json({ success: false, message: "Message body is required" });
    }

    if (!conversationId || !isValidUuid(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Conversation id required" });
    }

    const conversation = await queryOne(
      `
        SELECT ${CONVERSATION_COLUMNS}
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
      `,
      [conversationId]
    );

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

    const newMessage = await queryOne(
      `
        INSERT INTO chat_messages (
          conversation_id,
          sender_id,
          sender_role,
          body,
          read_by_user,
          read_by_seller
        )
        VALUES ($1, $2, $3, $4, false, true)
        RETURNING ${MESSAGE_COLUMNS}
      `,
      [conversationId, req.user, req.userRole, trimmedMessage]
    );

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

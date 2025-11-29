import { v2 as cloudinary } from "cloudinary";
import {
  ChatConversationModel,
  ChatMessageModel,
  ProductModel,
  UserModel,
} from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";
import { emitChatMessage } from "../socket/chat.events.js";

const CHAT_ATTACHMENT_FOLDER =
  process.env.CLOUDINARY_CHAT_FOLDER || "chat-attachments";

const toIdString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }

  return null;
};

const toPlain = (document) =>
  document?.toObject ? document.toObject() : document ?? null;

const formatAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .filter((attachment) => attachment?.url)
    .map((attachment) => ({
      url: attachment.url,
      type: attachment.type || "image",
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      bytes: attachment.bytes ?? null,
      publicId: attachment.publicId ?? null,
    }));

const uploadChatAttachments = async (files = []) => {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  files.forEach((file) => {
    if (!file?.mimetype?.startsWith("image/")) {
      throw new Error("Only image attachments are allowed");
    }
  });

  const uploads = await Promise.all(
    files.map(async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: CHAT_ATTACHMENT_FOLDER,
        resource_type: "image",
      });

      return {
        type: "image",
        url: result.secure_url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        publicId: result.public_id,
      };
    })
  );

  return uploads;
};

const normalizeMessageBody = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeOptionalId = (value) => {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const sanitizeUser = (userRecord) => {
  const payload = toPlain(userRecord);
  if (!payload) {
    return null;
  }

  const { password, __v, _id, ...rest } = payload;
  const id = toIdString(_id ?? payload.id);

  return {
    ...rest,
    id,
    _id: id,
  };
};

const sanitizeProduct = (productRecord) => {
  const payload = toPlain(productRecord);
  if (!payload) {
    return null;
  }

  const { __v, _id, ...rest } = payload;
  const id = toIdString(_id ?? payload.id);

  return {
    id,
    _id: id,
    name: rest.name,
    offerPrice: rest.offerPrice,
    image: rest.image,
  };
};

const formatMessage = (messageRecord) => {
  const payload = toPlain(messageRecord);
  if (!payload) {
    return null;
  }

  const { __v, _id, conversation, sender, attachments = [], ...rest } = payload;
  return {
    id: toIdString(_id ?? payload.id),
    conversationId: toIdString(conversation),
    senderId: toIdString(sender),
    senderRole: rest.senderRole,
    body: rest.body,
    attachments: formatAttachments(attachments),
    readByUser: rest.readByUser,
    readBySeller: rest.readBySeller,
    createdAt: rest.createdAt,
  };
};

const formatConversation = (conversationRecord, extras = {}) => {
  const payload = toPlain(conversationRecord);
  if (!payload) {
    return null;
  }

  const id = toIdString(payload._id ?? payload.id);
  const response = {
    id,
    _id: id,
    userId: toIdString(payload.user),
    sellerId: toIdString(payload.seller),
    productId: payload.product ? toIdString(payload.product) : null,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    lastMessage: extras.lastMessage ? formatMessage(extras.lastMessage) : null,
  };

  if (Object.prototype.hasOwnProperty.call(extras, "customer")) {
    response.customer = sanitizeUser(extras.customer);
  }

  if (Object.prototype.hasOwnProperty.call(extras, "seller")) {
    response.seller = sanitizeUser(extras.seller);
  }

  if (Object.prototype.hasOwnProperty.call(extras, "product")) {
    response.product = sanitizeProduct(extras.product);
  }

  return response;
};

const getLastMessage = async (conversationId) => {
  return ChatMessageModel.findOne({ conversation: conversationId })
    .sort({ createdAt: -1 })
    .lean();
};

const loadConversationWithMeta = async (conversationId) => {
  const conversation = await ChatConversationModel.findById(conversationId).lean();

  if (!conversation) {
    return null;
  }

  const [customer, seller, productRecord, lastMessage] = await Promise.all([
    UserModel.findById(conversation.user).lean(),
    UserModel.findById(conversation.seller).lean(),
    conversation.product
      ? ProductModel.findById(conversation.product).lean()
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

const findExistingConversation = async ({ userId, sellerId, productId }) => {
  const filters = { user: userId, seller: sellerId };
  if (productId) {
    filters.product = productId;
  } else {
    filters.product = null;
  }

  return ChatConversationModel.findOne(filters).lean();
};

const resolveSellerAndProduct = async ({ sellerId, productId }) => {
  let resolvedSellerId = sellerId ?? null;
  let resolvedProductId = productId ?? null;

  if (resolvedProductId) {
    if (!isValidObjectId(resolvedProductId)) {
      throw new Error("Invalid product id");
    }

    const productRecord = await ProductModel.findById(resolvedProductId)
      .select({ seller: 1 })
      .lean();

    if (!productRecord) {
      throw new Error("Product not found");
    }

    if (!productRecord.seller) {
      throw new Error("Product is not associated with a seller");
    }

    resolvedSellerId = toIdString(productRecord.seller);
    resolvedProductId = toIdString(productRecord._id);
  }

  if (!resolvedSellerId) {
    throw new Error("Seller id is required");
  }

  if (!isValidObjectId(resolvedSellerId)) {
    throw new Error("Invalid seller id");
  }

  const sellerRecord = await UserModel.findById(resolvedSellerId)
    .select({ role: 1, isActive: 1 })
    .lean();

  if (!sellerRecord || !["seller", "admin"].includes(sellerRecord.role)) {
    throw new Error("Seller account not found");
  }

  if (!sellerRecord.isActive) {
    throw new Error("Seller account is inactive");
  }

  return {
    sellerId: toIdString(sellerRecord._id),
    productId: resolvedProductId,
    sellerRecord,
  };
};

const ensureConversation = async ({ userId, sellerId, productId }) => {
  if (userId === sellerId) {
    throw new Error("Cannot create a conversation with yourself");
  }

  const existing = await findExistingConversation({ userId, sellerId, productId });
  if (existing) {
    return existing;
  }

  const created = await ChatConversationModel.create({
    user: userId,
    seller: sellerId,
    product: productId ?? null,
  });

  return toPlain(created);
};

const updateConversationTimestamp = async (conversationId) => {
  await ChatConversationModel.findByIdAndUpdate(conversationId, {
    updatedAt: new Date(),
  });
};

export const listUserConversations = async (req, res) => {
  try {
    const conversations = await ChatConversationModel.find({ user: req.user })
      .sort({ updatedAt: -1 })
      .lean();

    if (!conversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const sellerIds = [
      ...new Set(
        conversations
          .map((item) => toIdString(item.seller))
          .filter(Boolean)
      ),
    ];
    const productIds = [
      ...new Set(
        conversations
          .map((item) => toIdString(item.product))
          .filter(Boolean)
      ),
    ];

    const [customerRecord, sellerRecords, productRecords, lastMessageEntries] = await Promise.all([
      UserModel.findById(req.user).lean(),
      sellerIds.length
        ? UserModel.find({ _id: { $in: sellerIds } }).lean()
        : Promise.resolve([]),
      productIds.length
        ? ProductModel.find({ _id: { $in: productIds } }).lean()
        : Promise.resolve([]),
      Promise.all(
        conversations.map(async (conversation) => ({
          conversationId: toIdString(conversation._id),
          lastMessage: await getLastMessage(conversation._id),
        }))
      ),
    ]);

    const sellerMap = new Map(
      sellerRecords.map((record) => [toIdString(record._id), record])
    );
    const productMap = new Map(
      productRecords.map((record) => [toIdString(record._id), record])
    );
    const lastMessageMap = new Map(
      lastMessageEntries.map(({ conversationId, lastMessage }) => [conversationId, lastMessage])
    );

    const formatted = conversations.map((conversation) =>
      formatConversation(conversation, {
        customer: customerRecord,
        seller: sellerMap.get(toIdString(conversation.seller)) ?? null,
        product: productMap.get(toIdString(conversation.product)) ?? null,
        lastMessage:
          lastMessageMap.get(toIdString(conversation._id)) ?? null,
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

    if (!isValidObjectId(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation id" });
    }

    const conversation = await ChatConversationModel.findById(conversationId).lean();

    if (!conversation || toIdString(conversation.user) !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    const messages = await ChatMessageModel.find({ conversation: conversationId })
      .sort({ createdAt: 1 })
      .lean();

    await ChatMessageModel.updateMany(
      { conversation: conversationId, readByUser: false },
      { readByUser: true }
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
    const pendingFiles = Array.isArray(req.files) ? req.files : [];
    const sanitizedMessage = normalizeMessageBody(message);
    const normalizedSellerIdInput = normalizeOptionalId(sellerId);

    if (!sanitizedMessage && pendingFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message text or at least one image is required",
      });
    }

    const safeConversationId =
      typeof conversationId === "string" ? conversationId.trim() : conversationId;
    if (normalizedSellerIdInput && normalizedSellerIdInput === req.user) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot start a chat with yourself" });
    }

    let conversation = null;
    let resolvedSellerId = normalizedSellerIdInput;
    let resolvedProductId = normalizeOptionalId(productId);

    if (safeConversationId) {
      if (!isValidObjectId(safeConversationId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid conversation id" });
      }

      const existingConversation = await ChatConversationModel.findById(
        safeConversationId
      ).lean();

      if (!existingConversation || toIdString(existingConversation.user) !== req.user) {
        return res
          .status(404)
          .json({ success: false, message: "Conversation not found" });
      }

      conversation = existingConversation;
      resolvedSellerId = toIdString(conversation.seller);
      resolvedProductId = conversation.product
        ? toIdString(conversation.product)
        : null;
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

    if (toIdString(conversation.user) === toIdString(conversation.seller)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation participants" });
    }

    const conversationReference = conversation._id ?? safeConversationId;

    let attachments = [];
    try {
      attachments = await uploadChatAttachments(pendingFiles);
    } catch (error) {
      if (error?.message === "Only image attachments are allowed") {
        return res.status(400).json({ success: false, message: error.message });
      }
      throw error;
    }

    const newMessage = await ChatMessageModel.create({
      conversation: conversationReference,
      sender: req.user,
      senderRole: req.userRole ?? "customer",
      body: sanitizedMessage,
      attachments,
      readByUser: true,
      readBySeller: false,
    });

    const formattedMessage = formatMessage(newMessage);

    await updateConversationTimestamp(conversationReference);

    const conversationMeta = await loadConversationWithMeta(
      conversationReference
    );

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
    const conversations = await ChatConversationModel.find({ seller: req.user })
      .sort({ updatedAt: -1 })
      .lean();

    const validConversations = conversations.filter(
      (conversation) => toIdString(conversation.user) !== toIdString(conversation.seller)
    );

    if (!validConversations.length) {
      return res.json({ success: true, conversations: [] });
    }

    const userIds = [
      ...new Set(
        validConversations
          .map((item) => toIdString(item.user))
          .filter(Boolean)
      ),
    ];
    const productIds = [
      ...new Set(
        validConversations
          .map((item) => toIdString(item.product))
          .filter(Boolean)
      ),
    ];

    const [sellerRecord, customerRecords, productRecords, lastMessageEntries] = await Promise.all([
      UserModel.findById(req.user).lean(),
      userIds.length
        ? UserModel.find({ _id: { $in: userIds } }).lean()
        : Promise.resolve([]),
      productIds.length
        ? ProductModel.find({ _id: { $in: productIds } }).lean()
        : Promise.resolve([]),
      Promise.all(
        validConversations.map(async (conversation) => ({
          conversationId: toIdString(conversation._id),
          lastMessage: await getLastMessage(conversation._id),
        }))
      ),
    ]);

    const customerMap = new Map(
      customerRecords.map((record) => [toIdString(record._id), record])
    );
    const productMap = new Map(
      productRecords.map((record) => [toIdString(record._id), record])
    );
    const lastMessageMap = new Map(
      lastMessageEntries.map(({ conversationId, lastMessage }) => [conversationId, lastMessage])
    );

    const formatted = validConversations.map((conversation) =>
      formatConversation(conversation, {
        customer: customerMap.get(toIdString(conversation.user)) ?? null,
        seller: sellerRecord,
        product: productMap.get(toIdString(conversation.product)) ?? null,
        lastMessage:
          lastMessageMap.get(toIdString(conversation._id)) ?? null,
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

    if (!isValidObjectId(conversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid conversation id" });
    }

    const conversation = await ChatConversationModel.findById(conversationId).lean();

    if (!conversation || toIdString(conversation.seller) !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    if (toIdString(conversation.user) === toIdString(conversation.seller)) {
      return res.status(400).json({
        success: false,
        message: "Cannot load messages for your own seller account",
      });
    }

    const messages = await ChatMessageModel.find({ conversation: conversationId })
      .sort({ createdAt: 1 })
      .lean();

    await ChatMessageModel.updateMany(
      { conversation: conversationId, readBySeller: false },
      { readBySeller: true }
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
    const pendingFiles = Array.isArray(req.files) ? req.files : [];
    const sanitizedMessage = normalizeMessageBody(message);

    if (!sanitizedMessage && pendingFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message text or at least one image is required",
      });
    }

    const safeConversationId =
      typeof conversationId === "string" ? conversationId.trim() : conversationId;

    if (!safeConversationId || !isValidObjectId(safeConversationId)) {
      return res
        .status(400)
        .json({ success: false, message: "Conversation id required" });
    }

    const conversation = await ChatConversationModel.findById(safeConversationId).lean();

    if (!conversation || toIdString(conversation.seller) !== req.user) {
      return res
        .status(404)
        .json({ success: false, message: "Conversation not found" });
    }

    if (toIdString(conversation.user) === toIdString(conversation.seller)) {
      return res.status(400).json({
        success: false,
        message: "Cannot send messages to your own seller account",
      });
    }

    let attachments = [];
    try {
      attachments = await uploadChatAttachments(pendingFiles);
    } catch (error) {
      if (error?.message === "Only image attachments are allowed") {
        return res.status(400).json({ success: false, message: error.message });
      }
      throw error;
    }

    const newMessage = await ChatMessageModel.create({
      conversation: safeConversationId,
      sender: req.user,
      senderRole: req.userRole ?? "seller",
      body: sanitizedMessage,
      attachments,
      readByUser: false,
      readBySeller: true,
    });

    const formattedMessage = formatMessage(newMessage);

    await updateConversationTimestamp(safeConversationId);

    const conversationMeta = await loadConversationWithMeta(safeConversationId);

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

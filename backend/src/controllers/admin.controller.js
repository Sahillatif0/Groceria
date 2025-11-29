import bcrypt from "bcrypt";
import crypto from "node:crypto";
import {
  OrderItemModel,
  OrderModel,
  ProductModel,
  SellerModel,
  UserModel,
} from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";
import { recordAdminAction } from "../utils/adminAudit.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const SELLER_STATUS_SET = new Set(["pending", "active", "suspended"]);
const VALID_ORDER_STATUSES = new Set([
  "Order Placed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Cancelled by Admin",
]);

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

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const payload = userRecord.toObject ? userRecord.toObject() : userRecord;
  const { password, __v, _id, ...rest } = payload;
  const id = toIdString(_id ?? payload.id);

  return {
    ...rest,
    id,
    _id: id,
  };
};

const formatSellerRow = (row) => {
  if (!row) {
    return null;
  }

  const sellerId = toIdString(row._id ?? row.id);

  return {
    sellerId,
    id: sellerId,
    status: row.status,
    displayName: row.displayName,
    deactivatedAt: row.deactivatedAt,
    user: sanitizeUser(row.user),
  };
};

const formatProduct = (record) => {
  if (!record) {
    return null;
  }

  const payload = record.toObject ? record.toObject() : record;
  const { __v, _id, ...rest } = payload;
  const id = toIdString(_id ?? payload.id);

  return { ...rest, id, _id: id };
};

const formatOrder = (record) => {
  if (!record) {
    return null;
  }

  const payload = record.toObject ? record.toObject() : record;
  const { __v, _id, ...rest } = payload;
  const id = toIdString(_id ?? payload.id);

  return { ...rest, id, _id: id };
};

export const getUsersAdminHandler = async (req, res) => {
  try {
    const records = await UserModel.find().lean();

    return res
      .status(200)
      .json({ success: true, users: records.map(sanitizeUser) });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUserStatusAdminHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isActive flag required" });
    }
    const userRecord = await UserModel.findById(userId).lean();

    if (!userRecord) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (userRecord.role === "admin" && !isActive) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot deactivate another admin" });
    }

    if (userId === req.user && !isActive) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot deactivate yourself" });
    }

    await UserModel.findByIdAndUpdate(userId, {
      isActive,
      updatedAt: new Date(),
    });

    await recordTransactionLog({
      tableName: "users",
      recordId: userId,
      operation: "ADMIN_USER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: { isActive: userRecord.isActive },
      afterData: { isActive },
    });

    await recordAdminAction({
      adminId: req.user,
      action: isActive ? "user_activated" : "user_deactivated",
      targetType: "user",
      targetId: userId,
      metadata: {
        previous: userRecord.isActive,
        next: isActive,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUserAdminHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    const shouldHardDelete = req.query?.hard === "true";

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    if (userId === req.user) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const userRecord = await UserModel.findById(userId).lean();

    if (!userRecord) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (userRecord.role === "admin") {
      return res
        .status(400)
        .json({ success: false, message: "Cannot delete another admin" });
    }

    const baseLogPayload = {
      tableName: "users",
      recordId: userId,
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: {
        role: userRecord.role,
        isActive: userRecord.isActive,
      },
    };

    if (shouldHardDelete) {
      await UserModel.findByIdAndDelete(userId);

      await recordTransactionLog({
        ...baseLogPayload,
        operation: "ADMIN_USER_HARD_DELETED",
        description: "User removed by admin",
      });
    } else {
      await UserModel.findByIdAndUpdate(userId, {
        isActive: false,
        updatedAt: new Date(),
      });

      await recordTransactionLog({
        ...baseLogPayload,
        operation: "ADMIN_USER_SOFT_DELETED",
        afterData: { isActive: false },
      });
    }

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "user_hard_deleted" : "user_soft_deleted",
      targetType: "user",
      targetId: userId,
      metadata: {
        hardDelete: shouldHardDelete,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellersAdminHandler = async (req, res) => {
  try {
    const records = await SellerModel.find()
      .populate({ path: "user", select: "-password" })
      .lean();

    return res
      .status(200)
      .json({ success: true, sellers: records.map(formatSellerRow) });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createSellerAdminHandler = async (req, res) => {
  try {
    const { name, email, password, displayName, status = "pending" } =
      req.body;

    if (!name || !email || !displayName) {
      return res.status(400).json({
        success: false,
        message: "Name, email and display name are required",
      });
    }

    if (!SELLER_STATUS_SET.has(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller status",
      });
    }

    const now = new Date();
    const existingUser = await UserModel.findOne({ email }).lean();

    let userId;
    let generatedPassword = null;

    if (existingUser) {
      if (existingUser.role === "admin") {
        return res.status(400).json({
          success: false,
          message: "Admins already have full access",
        });
      }

      await UserModel.findByIdAndUpdate(existingUser._id, {
        name,
        role: "seller",
        isActive: true,
        updatedAt: now,
      });
      userId = existingUser._id.toString();

      await recordTransactionLog({
        tableName: "users",
        recordId: userId,
        operation: "ADMIN_EXISTING_USER_PROMOTED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        beforeData: {
          role: existingUser.role,
          isActive: existingUser.isActive,
        },
        afterData: { role: "seller", isActive: true },
      });
    } else {
      let plainPassword = password?.trim();
      if (!plainPassword) {
        plainPassword = crypto.randomBytes(8).toString("hex");
        generatedPassword = plainPassword;
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const createdUser = await UserModel.create({
        name,
        email,
        password: hashedPassword,
        role: "seller",
        isActive: true,
      });
      userId = createdUser._id.toString();

      await recordTransactionLog({
        tableName: "users",
        recordId: userId,
        operation: "ADMIN_SELLER_USER_CREATED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        afterData: {
          name,
          email,
          role: "seller",
        },
      });
    }

    const existingSeller = await SellerModel.findOne({ user: userId }).lean();

    const sellerPayload = {
      displayName,
      status,
      deactivatedAt: status === "suspended" ? now : null,
      updatedAt: now,
    };

    let sellerRecordId = existingSeller?._id?.toString() ?? null;
    let sellerBefore = existingSeller
      ? {
          status: existingSeller.status,
          displayName: existingSeller.displayName,
        }
      : null;

    if (existingSeller) {
      await SellerModel.findByIdAndUpdate(existingSeller._id, sellerPayload);
    } else {
      const createdSeller = await SellerModel.create({
        user: userId,
        displayName,
        status,
        deactivatedAt: status === "suspended" ? now : null,
      });
      sellerRecordId = createdSeller._id.toString();
    }

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerRecordId,
      operation: existingSeller ? "ADMIN_SELLER_UPDATED" : "ADMIN_SELLER_CREATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: sellerBefore,
      afterData: { status, displayName },
    });

    await recordAdminAction({
      adminId: req.user,
      action: existingSeller ? "seller_updated" : "seller_created",
      targetType: "seller",
      targetId: userId,
      metadata: {
        status,
        displayName,
        email,
      },
    });

    const response = {
      success: true,
      message: existingSeller ? "Seller updated" : "Seller created",
    };

    if (generatedPassword) {
      response.credentials = { email, password: generatedPassword };
    }

    return res.status(existingSeller ? 200 : 201).json(response);
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const promoteUserToSellerHandler = async (req, res) => {
  try {
    const { userId, displayName } = req.body;

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    if (!displayName) {
      return res
        .status(400)
        .json({ success: false, message: "Display name is required" });
    }

    const userRecord = await UserModel.findById(userId).lean();

    if (!userRecord) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (userRecord.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Admin already has full access",
      });
    }

    await UserModel.findByIdAndUpdate(userId, {
      role: "seller",
      isActive: true,
      updatedAt: new Date(),
    });

    await recordTransactionLog({
      tableName: "users",
      recordId: userId,
      operation: "ADMIN_USER_PROMOTED_TO_SELLER",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: { role: userRecord.role, isActive: userRecord.isActive },
      afterData: { role: "seller", isActive: true },
    });

    const existingSellerRecord = await SellerModel.findOne({ user: userId }).lean();
    let sellerRecordId = existingSellerRecord?._id?.toString() ?? null;
    let sellerStatus = existingSellerRecord?.status ?? "active";

    if (existingSellerRecord) {
      await SellerModel.findByIdAndUpdate(existingSellerRecord._id, {
        displayName,
        status: "active",
        deactivatedAt: null,
        updatedAt: new Date(),
      });
      sellerStatus = "active";
    } else {
      const createdSeller = await SellerModel.create({
        user: userId,
        displayName,
        status: "active",
      });
      sellerRecordId = createdSeller._id.toString();
      sellerStatus = "active";
    }

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerRecordId,
      operation: "ADMIN_SELLER_PROMOTED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      afterData: { status: sellerStatus, displayName },
    });

    await recordAdminAction({
      adminId: req.user,
      action: "seller_promoted",
      targetType: "seller",
      targetId: userId,
      metadata: { displayName },
    });

    return res
      .status(200)
      .json({ success: true, message: "User promoted to seller" });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSellerStatusAdminHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { status } = req.body;

    if (!isValidObjectId(sellerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller id" });
    }

    if (!SELLER_STATUS_SET.has(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller status" });
    }

    const sellerRecord = await SellerModel.findById(sellerId)
      .select({ user: 1, status: 1 })
      .lean();

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    const now = new Date();

    await SellerModel.findByIdAndUpdate(sellerId, {
      status,
      deactivatedAt: status === "suspended" ? now : null,
      updatedAt: now,
    });

    await UserModel.findByIdAndUpdate(sellerRecord.user, {
      isActive: status !== "suspended",
      role: status === "suspended" ? "customer" : "seller",
      updatedAt: now,
    });

    await recordTransactionLog({
      tableName: "sellers",
      recordId: toIdString(sellerRecord._id),
      operation: "ADMIN_SELLER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: { status: sellerRecord.status },
      afterData: { status },
    });

    await recordTransactionLog({
      tableName: "users",
      recordId: toIdString(sellerRecord.user),
      operation: "ADMIN_SELLER_LINKED_USER_UPDATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      afterData: {
        role: status === "suspended" ? "customer" : "seller",
        isActive: status !== "suspended",
      },
    });

    await recordAdminAction({
      adminId: req.user,
      action: "seller_status_updated",
      targetType: "seller",
      targetId: toIdString(sellerRecord.user),
      metadata: { from: sellerRecord.status, to: status },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSellerAdminHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const shouldHardDelete = req.query?.hard === "true";

    if (!isValidObjectId(sellerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller id" });
    }

    const sellerRecord = await SellerModel.findById(sellerId).lean();

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    if (shouldHardDelete) {
      await SellerModel.findByIdAndDelete(sellerId);
    } else {
      const now = new Date();
      await SellerModel.findByIdAndUpdate(sellerId, {
        status: "suspended",
        deactivatedAt: now,
        updatedAt: now,
      });
    }

    await UserModel.findByIdAndUpdate(sellerRecord.user, {
      role: "customer",
      updatedAt: new Date(),
      isActive: false,
    });

    await recordTransactionLog({
      tableName: "sellers",
      recordId: toIdString(sellerRecord._id),
      operation: shouldHardDelete
        ? "ADMIN_SELLER_HARD_DELETED"
        : "ADMIN_SELLER_SUSPENDED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: { status: sellerRecord.status },
      afterData: shouldHardDelete ? null : { status: "suspended" },
    });

    await recordTransactionLog({
      tableName: "users",
      recordId: toIdString(sellerRecord.user),
      operation: "ADMIN_SELLER_USER_DEACTIVATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      afterData: { role: "customer", isActive: false },
    });

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "seller_hard_deleted" : "seller_suspended",
      targetType: "seller",
      targetId: toIdString(sellerRecord.user),
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductsAdminHandler = async (req, res) => {
  try {
    const includeArchived = req.query?.includeArchived === "true";

    const query = includeArchived ? {} : { isArchived: false };
    const records = await ProductModel.find(query).lean();

    return res.status(200).json({
      success: true,
      products: records.map(formatProduct),
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProductAdminHandler = async (req, res) => {
  try {
    const { productId } = req.params;
    const shouldHardDelete = req.query?.hard === "true";

    if (!isValidObjectId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await ProductModel.findById(productId).lean();

    if (!productRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (shouldHardDelete) {
      const linkedOrderItem = await OrderItemModel.exists({ product: productId });

      if (linkedOrderItem) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot permanently delete a product with existing order history. Archive instead or remove related orders first.",
        });
      }

      await ProductModel.findByIdAndDelete(productId);

      await recordTransactionLog({
        tableName: "products",
        recordId: productId,
        operation: "ADMIN_PRODUCT_HARD_DELETED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        beforeData: { isArchived: productRecord.isArchived },
        description: "Product removed by admin",
      });
    } else {
      const archivedProduct = await ProductModel.findByIdAndUpdate(
        productId,
        { isArchived: true, updatedAt: new Date() },
        { new: true, lean: true }
      );

      await recordTransactionLog({
        tableName: "products",
        recordId: productId,
        operation: "ADMIN_PRODUCT_ARCHIVED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        beforeData: { isArchived: productRecord.isArchived },
        afterData: { isArchived: archivedProduct?.isArchived ?? true },
      });
    }

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "product_hard_deleted" : "product_archived",
      targetType: "product",
      targetId: productId,
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getOrdersAdminHandler = async (req, res) => {
  try {
    const includeCancelled = req.query?.includeCancelled === "true";

    const query = includeCancelled
      ? {}
      : { status: { $nin: ["Cancelled", "Cancelled by Admin"] } };

    const records = await OrderModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res
      .status(200)
      .json({ success: true, orders: records.map(formatOrder) });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatusAdminHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, isPaid } = req.body;

    if (!isValidObjectId(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    if (!VALID_ORDER_STATUSES.has(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status" });
    }

    const orderRecord = await OrderModel.findById(orderId).lean();

    if (!orderRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const now = new Date();
    const payload = {
      status,
      updatedAt: now,
    };

    if (typeof isPaid === "boolean") {
      payload.isPaid = isPaid;
    }

    payload.cancelledAt = status.toLowerCase().includes("cancel")
      ? now
      : null;

    await OrderModel.findByIdAndUpdate(orderId, payload);

    await recordTransactionLog({
      tableName: "orders",
      recordId: orderId,
      operation: "ADMIN_ORDER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: req.userRole ?? "admin",
      beforeData: {
        status: orderRecord.status,
        isPaid: orderRecord.isPaid,
      },
      afterData: {
        status,
        isPaid: payload.isPaid ?? orderRecord.isPaid,
      },
    });

    await recordAdminAction({
      adminId: req.user,
      action: "order_status_updated",
      targetType: "order",
      targetId: orderId,
      metadata: {
        from: orderRecord.status,
        to: status,
        paid: payload.isPaid ?? orderRecord.isPaid,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteOrderAdminHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shouldHardDelete = req.query?.hard === "true";

    if (!isValidObjectId(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    const now = new Date();

    const orderRecord = await OrderModel.findById(orderId).lean();

    if (!orderRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (shouldHardDelete) {
      await OrderItemModel.deleteMany({ order: orderId });
      await OrderModel.findByIdAndDelete(orderId);

      await recordTransactionLog({
        tableName: "orders",
        recordId: orderId,
        operation: "ADMIN_ORDER_HARD_DELETED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        beforeData: { status: orderRecord.status },
        description: "Order removed by admin",
      });
    } else {
      const cancelledOrder = await OrderModel.findByIdAndUpdate(
        orderId,
        {
          status: "Cancelled by Admin",
          cancelledAt: now,
          updatedAt: now,
        },
        { new: true, lean: true }
      );

      await recordTransactionLog({
        tableName: "orders",
        recordId: orderId,
        operation: "ADMIN_ORDER_CANCELLED",
        actorId: req.user,
        actorRole: req.userRole ?? "admin",
        beforeData: { status: orderRecord.status },
        afterData: { status: cancelledOrder?.status ?? "Cancelled by Admin" },
      });
    }

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "order_hard_deleted" : "order_cancelled",
      targetType: "order",
      targetId: orderId,
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { query, queryOne, queryMany } from "../db/client.js";
import { isValidUuid } from "../utils/validators.js";
import { recordAdminAction } from "../utils/adminAudit.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const SELLER_STATUSES = new Set(["pending", "active", "suspended"]);
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

const USER_COLUMNS = `
  id,
  name,
  email,
  role,
  is_active,
  created_at,
  updated_at
`;

const SELLER_COLUMNS = `
  id,
  user_id,
  display_name,
  status,
  deactivated_at,
  created_at,
  updated_at
`;

const PRODUCT_COLUMNS = `
  id,
  name,
  description,
  price,
  offer_price,
  image,
  category,
  in_stock,
  is_archived,
  seller_id,
  created_at,
  updated_at
`;

const ORDER_COLUMNS = `
  id,
  user_id,
  amount,
  address_id,
  status,
  payment_type,
  is_paid,
  cancelled_at,
  created_at,
  updated_at
`;

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const { password, ...rest } = userRecord;
  return { ...rest, _id: userRecord.id };
};

const formatSellerRow = (row) => ({
  sellerId: row.sellerId,
  status: row.status,
  displayName: row.displayName,
  deactivatedAt: row.deactivatedAt,
  user: sanitizeUser({
    id: row.userId,
    name: row.userName,
    email: row.userEmail,
    role: row.userRole,
    isActive: row.userIsActive,
    createdAt: row.userCreatedAt,
    updatedAt: row.userUpdatedAt,
  }),
});

const formatProductRecord = (record) =>
  record
    ? {
        ...record,
        _id: record.id,
      }
    : null;

const formatOrderRecord = (record) =>
  record
    ? {
        ...record,
        _id: record.id,
      }
    : null;

export const getUsersAdminHandler = async (req, res) => {
  try {
    const records = await queryMany(`SELECT ${USER_COLUMNS} FROM users`);

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

    if (!isValidUuid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isActive flag required" });
    }

    const userRecord = await queryOne(
      `
        SELECT id, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

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

    await query(
      `
        UPDATE users
        SET is_active = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [isActive, userId]
    );

    await recordTransactionLog({
      tableName: "users",
      recordId: userId,
      operation: "ADMIN_USER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: "admin",
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

    if (!isValidUuid(userId)) {
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

    const userRecord = await queryOne(
      `
        SELECT id, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

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
      actorRole: "admin",
      beforeData: {
        role: userRecord.role,
        isActive: userRecord.isActive,
      },
    };

    if (shouldHardDelete) {
      await query(`DELETE FROM users WHERE id = $1`, [userId]);

      await recordTransactionLog({
        ...baseLogPayload,
        operation: "ADMIN_USER_HARD_DELETED",
        description: "User removed by admin",
      });
    } else {
      if (!userRecord.isActive) {
        return res
          .status(400)
          .json({ success: false, message: "User already inactive" });
      }

      await query(
        `
          UPDATE users
          SET is_active = false,
              updated_at = NOW()
          WHERE id = $1
        `,
        [userId]
      );

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
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({
      success: true,
      message: shouldHardDelete ? "User deleted" : "User deactivated",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellersAdminHandler = async (req, res) => {
  try {
    const records = await queryMany(
      `
        SELECT
          s.id AS seller_id,
          s.status,
          s.display_name,
          s.deactivated_at,
          u.id AS user_id,
          u.name AS user_name,
          u.email AS user_email,
          u.role AS user_role,
          u.is_active AS user_is_active,
          u.created_at AS user_created_at,
          u.updated_at AS user_updated_at
        FROM sellers s
        LEFT JOIN users u ON s.user_id = u.id
      `
    );

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

    if (!SELLER_STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seller status",
      });
    }

    const existingUser = await queryOne(
      `
        SELECT id, role, is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    let userId;
    let generatedPassword = null;

    if (existingUser) {
      if (existingUser.role === "admin") {
        return res.status(400).json({
          success: false,
          message: "Admins already have full access",
        });
      }

      await query(
        `
          UPDATE users
          SET name = $1,
              role = 'seller',
              is_active = true,
              updated_at = NOW()
          WHERE id = $2
        `,
        [name, existingUser.id]
      );
      userId = existingUser.id;

      await recordTransactionLog({
        tableName: "users",
        recordId: userId,
        operation: "ADMIN_EXISTING_USER_PROMOTED",
        actorId: req.user,
        actorRole: "admin",
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

      const createdUser = await queryOne(
        `
          INSERT INTO users (name, email, password, role, is_active)
          VALUES ($1, $2, $3, 'seller', true)
          RETURNING ${USER_COLUMNS}
        `,
        [name, email, hashedPassword]
      );

      userId = createdUser.id;

      await recordTransactionLog({
        tableName: "users",
        recordId: createdUser.id,
        operation: "ADMIN_SELLER_USER_CREATED",
        actorId: req.user,
        actorRole: "admin",
        afterData: {
          name: createdUser.name,
          email: createdUser.email,
          role: createdUser.role,
        },
      });
    }

    const existingSeller = await queryOne(
      `
        SELECT ${SELLER_COLUMNS}
        FROM sellers
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    const now = new Date();
    const sellerPayload = {
      displayName,
      status,
      deactivatedAt: status === "suspended" ? now : null,
      updatedAt: now,
    };

    let sellerRecordId = existingSeller?.id ?? null;
    let sellerBefore = existingSeller
      ? {
          status: existingSeller.status,
          displayName: existingSeller.displayName,
        }
      : null;

    if (existingSeller) {
      await query(
        `
          UPDATE sellers
          SET display_name = $1,
              status = $2,
              deactivated_at = $3,
              updated_at = NOW()
          WHERE id = $4
        `,
        [
          sellerPayload.displayName,
          sellerPayload.status,
          sellerPayload.deactivatedAt,
          existingSeller.id,
        ]
      );
    } else {
      const createdSeller = await queryOne(
        `
          INSERT INTO sellers (user_id, display_name, status, deactivated_at)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [userId, sellerPayload.displayName, sellerPayload.status, sellerPayload.deactivatedAt]
      );
      sellerRecordId = createdSeller?.id ?? sellerRecordId;
    }

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerRecordId,
      operation: existingSeller ? "ADMIN_SELLER_UPDATED" : "ADMIN_SELLER_CREATED",
      actorId: req.user,
      actorRole: "admin",
      beforeData: sellerBefore,
      afterData: { status, displayName },
    });

    await recordAdminAction({
      adminId: req.user,
      action: existingSeller ? "seller_updated" : "seller_created",
      targetType: "seller",
      targetId: userId,
      metadata: { status, displayName, email },
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

    if (!isValidUuid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    if (!displayName) {
      return res
        .status(400)
        .json({ success: false, message: "Display name is required" });
    }

    const userRecord = await queryOne(
      `
        SELECT id, role, is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

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

    await query(
      `
        UPDATE users
        SET role = 'seller',
            is_active = true,
            updated_at = NOW()
        WHERE id = $1
      `,
      [userId]
    );

    await recordTransactionLog({
      tableName: "users",
      recordId: userId,
      operation: "ADMIN_USER_PROMOTED_TO_SELLER",
      actorId: req.user,
      actorRole: "admin",
      beforeData: { role: userRecord.role, isActive: userRecord.isActive },
      afterData: { role: "seller", isActive: true },
    });

    const createdSeller = await queryOne(
      `
        INSERT INTO sellers (user_id, display_name, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (user_id) DO NOTHING
        RETURNING id, status
      `,
      [userId, displayName]
    );

    let sellerRecordId = createdSeller?.id ?? null;
    let sellerStatus = createdSeller?.status ?? "active";

    if (!sellerRecordId) {
      const existingSellerRecord = await queryOne(
        `
          SELECT id, status
          FROM sellers
          WHERE user_id = $1
          LIMIT 1
        `,
        [userId]
      );
      sellerRecordId = existingSellerRecord?.id ?? null;
      sellerStatus = existingSellerRecord?.status ?? sellerStatus;
    }

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerRecordId,
      operation: "ADMIN_SELLER_PROMOTED",
      actorId: req.user,
      actorRole: "admin",
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

    if (!isValidUuid(sellerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller id" });
    }

    if (!SELLER_STATUSES.has(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller status" });
    }

    const sellerRecord = await queryOne(
      `
        SELECT id, user_id, status
        FROM sellers
        WHERE id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    await query(
      `
        UPDATE sellers
        SET status = $1,
            deactivated_at = CASE WHEN $1 = 'suspended' THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $2
      `,
      [status, sellerId]
    );

    await query(
      `
        UPDATE users
        SET is_active = $1,
            role = $2,
            updated_at = NOW()
        WHERE id = $3
      `,
      [
        status !== "suspended",
        status === "suspended" ? "customer" : "seller",
        sellerRecord.userId,
      ]
    );

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerId,
      operation: "ADMIN_SELLER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: "admin",
      beforeData: { status: sellerRecord.status },
      afterData: { status },
    });

    await recordAdminAction({
      adminId: req.user,
      action:
        status === "suspended"
          ? "seller_suspended"
          : status === "active"
          ? "seller_reinstated"
          : "seller_status_updated",
      targetType: "seller",
      targetId: sellerId,
      metadata: { previous: sellerRecord.status, next: status },
    });

    return res
      .status(200)
      .json({ success: true, message: "Seller status updated" });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteSellerAdminHandler = async (req, res) => {
  try {
    const { sellerId } = req.params;

    if (!isValidUuid(sellerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller id" });
    }

    const sellerRecord = await queryOne(
      `
        SELECT s.id, s.user_id, s.status, u.role AS user_role, u.is_active AS user_is_active
        FROM sellers s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.id = $1
        LIMIT 1
      `,
      [sellerId]
    );

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    await query(
      `
        UPDATE sellers
        SET status = 'suspended',
            deactivated_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [sellerId]
    );

    if (sellerRecord.userId) {
      await query(
        `
          UPDATE users
          SET role = CASE WHEN role = 'seller' THEN 'customer' ELSE role END,
              is_active = false,
              updated_at = NOW()
          WHERE id = $1
        `,
        [sellerRecord.userId]
      );
    }

    await recordTransactionLog({
      tableName: "sellers",
      recordId: sellerId,
      operation: "ADMIN_SELLER_SUSPENDED",
      actorId: req.user,
      actorRole: "admin",
      beforeData: { status: sellerRecord.status },
      afterData: { status: "suspended" },
    });

    await recordAdminAction({
      adminId: req.user,
      action: "seller_suspended",
      targetType: "seller",
      targetId: sellerId,
      metadata: { previous: sellerRecord.status, userId: sellerRecord.userId },
    });

    return res
      .status(200)
      .json({ success: true, message: "Seller suspended" });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getProductsAdminHandler = async (req, res) => {
  try {
    const includeArchived = req.query?.includeArchived === "true";

    const products = await queryMany(
      `
        SELECT ${PRODUCT_COLUMNS}
        FROM products
        ${includeArchived ? "" : "WHERE is_archived = false"}
        ORDER BY created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      products: products.map(formatProductRecord),
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

    if (!isValidUuid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await queryOne(
      `
        SELECT ${PRODUCT_COLUMNS}
        FROM products
        WHERE id = $1
        LIMIT 1
      `,
      [productId]
    );

    if (!productRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (!shouldHardDelete && productRecord.isArchived) {
      return res
        .status(400)
        .json({ success: false, message: "Product already archived" });
    }

    if (shouldHardDelete) {
      await query(`DELETE FROM order_items WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM products WHERE id = $1`, [productId]);

      await recordTransactionLog({
        tableName: "products",
        recordId: productId,
        operation: "ADMIN_PRODUCT_HARD_DELETED",
        actorId: req.user,
        actorRole: "admin",
        beforeData: {
          name: productRecord.name,
          isArchived: productRecord.isArchived,
        },
      });
    } else {
      const archivedProduct = await queryOne(
        `
          UPDATE products
          SET is_archived = true,
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${PRODUCT_COLUMNS}
        `,
        [productId]
      );

      await recordTransactionLog({
        tableName: "products",
        recordId: productId,
        operation: "ADMIN_PRODUCT_ARCHIVED",
        actorId: req.user,
        actorRole: "admin",
        beforeData: { isArchived: productRecord.isArchived },
        afterData: { isArchived: archivedProduct.isArchived },
      });
    }

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "product_deleted" : "product_archived",
      targetType: "product",
      targetId: productId,
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({
      success: true,
      message: shouldHardDelete ? "Product deleted" : "Product archived",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getOrdersAdminHandler = async (req, res) => {
  try {
    const includeCancelled = req.query?.includeCancelled === "true";

    const orders = await queryMany(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        ${includeCancelled ? "" : "WHERE status NOT IN ('Cancelled', 'Cancelled by Admin')"}
        ORDER BY created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      orders: orders.map(formatOrderRecord),
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatusAdminHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!isValidUuid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    if (!VALID_ORDER_STATUSES.has(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status" });
    }

    const orderRecord = await queryOne(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        WHERE id = $1
        LIMIT 1
      `,
      [orderId]
    );

    if (!orderRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (orderRecord.status === status) {
      return res.status(200).json({ success: true, message: "No changes" });
    }

    await query(
      `
        UPDATE orders
        SET status = $1,
            cancelled_at = CASE
              WHEN $1 IN ('Cancelled', 'Cancelled by Admin') THEN NOW()
              ELSE NULL
            END,
            updated_at = NOW()
        WHERE id = $2
      `,
      [status, orderId]
    );

    await recordTransactionLog({
      tableName: "orders",
      recordId: orderId,
      operation: "ADMIN_ORDER_STATUS_UPDATED",
      actorId: req.user,
      actorRole: "admin",
      beforeData: { status: orderRecord.status },
      afterData: { status },
    });

    await recordAdminAction({
      adminId: req.user,
      action: "order_status_updated",
      targetType: "order",
      targetId: orderId,
      metadata: { previous: orderRecord.status, next: status },
    });

    return res
      .status(200)
      .json({ success: true, message: "Order status updated" });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteOrderAdminHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shouldHardDelete = req.query?.hard === "true";

    if (!isValidUuid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    const orderRecord = await queryOne(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        WHERE id = $1
        LIMIT 1
      `,
      [orderId]
    );

    if (!orderRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (shouldHardDelete) {
      await query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
      await query(`DELETE FROM orders WHERE id = $1`, [orderId]);

      await recordTransactionLog({
        tableName: "orders",
        recordId: orderId,
        operation: "ADMIN_ORDER_HARD_DELETED",
        actorId: req.user,
        actorRole: "admin",
        beforeData: { status: orderRecord.status },
      });
    } else {
      if (
        orderRecord.status === "Cancelled" ||
        orderRecord.status === "Cancelled by Admin"
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Order already cancelled" });
      }

      await query(
        `
          UPDATE orders
          SET status = 'Cancelled by Admin',
              cancelled_at = NOW(),
              is_paid = false,
              updated_at = NOW()
          WHERE id = $1
        `,
        [orderId]
      );

      await recordTransactionLog({
        tableName: "orders",
        recordId: orderId,
        operation: "ADMIN_ORDER_CANCELLED",
        actorId: req.user,
        actorRole: "admin",
        beforeData: { status: orderRecord.status },
        afterData: { status: "Cancelled by Admin" },
      });
    }

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "order_deleted" : "order_cancelled",
      targetType: "order",
      targetId: orderId,
      metadata: { hardDelete: shouldHardDelete },
    });

    return res.status(200).json({
      success: true,
      message: shouldHardDelete ? "Order deleted" : "Order cancelled",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

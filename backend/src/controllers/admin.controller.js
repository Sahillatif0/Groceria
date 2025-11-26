import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { getDb } from "../db/client.js";
import {
  users,
  sellers,
  products,
  orders,
  orderItems,
} from "../db/schema.js";
import { desc, eq, inArray, notInArray } from "drizzle-orm";
import { isValidUuid } from "../utils/validators.js";
import { recordAdminAction } from "../utils/adminAudit.js";

const db = () => getDb();

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
  user: sanitizeUser(row.user),
});

export const getUsersAdminHandler = async (req, res) => {
  try {
    const records = await db().select().from(users);

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

    const [userRecord] = await db()
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

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

    await db()
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId));

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

    const [userRecord] = await db()
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

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

    if (shouldHardDelete) {
      await db().delete(users).where(eq(users.id, userId));
    } else {
      await db()
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, userId));
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
    const records = await db()
      .select({
        sellerId: sellers.id,
        status: sellers.status,
        displayName: sellers.displayName,
        deactivatedAt: sellers.deactivatedAt,
        user: users,
      })
      .from(sellers)
      .leftJoin(users, eq(sellers.userId, users.id));

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

    const now = new Date();
    const dbClient = db();

    const [existingUser] = await dbClient
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId;
    let generatedPassword = null;

    if (existingUser) {
      if (existingUser.role === "admin") {
        return res.status(400).json({
          success: false,
          message: "Admins already have full access",
        });
      }

      await dbClient
        .update(users)
        .set({
          name,
          role: "seller",
          isActive: true,
          updatedAt: now,
        })
        .where(eq(users.id, existingUser.id));
      userId = existingUser.id;
    } else {
      let plainPassword = password?.trim();
      if (!plainPassword) {
        plainPassword = crypto.randomBytes(8).toString("hex");
        generatedPassword = plainPassword;
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      const [createdUser] = await dbClient
        .insert(users)
        .values({
          name,
          email,
          password: hashedPassword,
          role: "seller",
          isActive: true,
        })
        .returning();

      userId = createdUser.id;
    }

    const [existingSeller] = await dbClient
      .select()
      .from(sellers)
      .where(eq(sellers.userId, userId))
      .limit(1);

    const sellerPayload = {
      displayName,
      status,
      deactivatedAt: status === "suspended" ? now : null,
      updatedAt: now,
    };

    if (existingSeller) {
      await dbClient
        .update(sellers)
        .set(sellerPayload)
        .where(eq(sellers.id, existingSeller.id));
    } else {
      await dbClient.insert(sellers).values({
        userId,
        displayName,
        status,
        deactivatedAt: status === "suspended" ? now : null,
      });
    }

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

    const [userRecord] = await db()
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

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

    await db()
      .update(users)
      .set({ role: "seller", isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await db()
      .insert(sellers)
      .values({ userId, displayName, status: "active" })
      .onConflictDoNothing();

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

    const [sellerRecord] = await db()
      .select({
        id: sellers.id,
        userId: sellers.userId,
        status: sellers.status,
      })
      .from(sellers)
      .where(eq(sellers.id, sellerId))
      .limit(1);

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    const now = new Date();

    await db()
      .update(sellers)
      .set({
        status,
        deactivatedAt: status === "suspended" ? now : null,
        updatedAt: now,
      })
      .where(eq(sellers.id, sellerId));

    await db()
      .update(users)
      .set({
        isActive: status !== "suspended",
        role: status === "suspended" ? "customer" : "seller",
        updatedAt: now,
      })
      .where(eq(users.id, sellerRecord.userId));

    await recordAdminAction({
      adminId: req.user,
      action: "seller_status_updated",
      targetType: "seller",
      targetId: sellerRecord.userId,
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

    if (!isValidUuid(sellerId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid seller id" });
    }

    const [sellerRecord] = await db()
      .select()
      .from(sellers)
      .where(eq(sellers.id, sellerId))
      .limit(1);

    if (!sellerRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Seller not found" });
    }

    if (shouldHardDelete) {
      await db().delete(sellers).where(eq(sellers.id, sellerId));
    } else {
      const now = new Date();
      await db()
        .update(sellers)
        .set({
          status: "suspended",
          deactivatedAt: now,
          updatedAt: now,
        })
        .where(eq(sellers.id, sellerId));
    }

    await db()
      .update(users)
      .set({ role: "customer", updatedAt: new Date(), isActive: false })
      .where(eq(users.id, sellerRecord.userId));

    await recordAdminAction({
      adminId: req.user,
      action: shouldHardDelete ? "seller_hard_deleted" : "seller_suspended",
      targetType: "seller",
      targetId: sellerRecord.userId,
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

    const records = includeArchived
      ? await db().select().from(products)
      : await db()
          .select()
          .from(products)
          .where(eq(products.isArchived, false));

    return res.status(200).json({
      success: true,
      products: records.map((product) => ({ ...product, _id: product.id })),
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

    const [productRecord] = await db()
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!productRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (shouldHardDelete) {
      const [linkedOrderItem] = await db()
        .select()
        .from(orderItems)
        .where(eq(orderItems.productId, productId))
        .limit(1);

      if (linkedOrderItem) {
        return res.status(409).json({
          success: false,
          message:
            "Cannot permanently delete a product with existing order history. Archive instead or remove related orders first.",
        });
      }

      await db().delete(products).where(eq(products.id, productId));
    } else {
      await db()
        .update(products)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(products.id, productId));
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
      ? db().select().from(orders).orderBy(desc(orders.createdAt))
      : db()
          .select()
          .from(orders)
          .where(notInArray(orders.status, ["Cancelled", "Cancelled by Admin"]))
          .orderBy(desc(orders.createdAt));

    const records = await query;

    return res.status(200).json({ success: true, orders: records });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatusAdminHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, isPaid } = req.body;

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

    const [orderRecord] = await db()
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

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

    await db()
      .update(orders)
      .set(payload)
      .where(eq(orders.id, orderId));

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

    if (!isValidUuid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    const now = new Date();

    if (shouldHardDelete) {
      const relatedItems = await db()
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      if (relatedItems.length) {
        await db()
          .delete(orderItems)
          .where(inArray(orderItems.id, relatedItems.map((item) => item.id)));
      }

      await db().delete(orders).where(eq(orders.id, orderId));
    } else {
      await db()
        .update(orders)
        .set({
          status: "Cancelled by Admin",
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));
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

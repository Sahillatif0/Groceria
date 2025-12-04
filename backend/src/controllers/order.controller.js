import stripe from "stripe";
import {
  OrderModel,
  OrderItemModel,
  ProductModel,
  AddressModel,
  UserModel,
} from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const toPlain = (doc) => (doc?.toObject ? doc.toObject() : doc);

const buildProductsMap = async (productIds = []) => {
  if (!productIds.length) {
    return new Map();
  }

  const rows = await ProductModel.find({
    _id: { $in: productIds },
    isArchived: false,
  }).lean();

  return new Map(
    rows.map((item) => [item._id.toString(), { ...item, _id: item._id.toString() }])
  );
};

const attachOrderRelations = async (ordersList = []) => {
  if (!ordersList.length) {
    return [];
  }

  const normalizedOrders = ordersList.map((order) => toPlain(order));
  const orderIds = normalizedOrders.map((order) => order._id.toString());

  const itemsRows = await OrderItemModel.find({ order: { $in: orderIds } }).lean();

  const addressIds = Array.from(
    new Set(
      normalizedOrders
        .map((order) => order.address?.toString())
        .filter(Boolean)
    )
  );

  const addressesRows = addressIds.length
    ? await AddressModel.find({ _id: { $in: addressIds } }).lean()
    : [];

  const productIds = Array.from(
    new Set(itemsRows.map((item) => item.product?.toString()).filter(Boolean))
  );
  const productsRows = productIds.length
    ? await ProductModel.find({ _id: { $in: productIds } }).lean()
    : [];

  const addressMap = new Map(
    addressesRows.map((addr) => [addr._id.toString(), { ...addr, _id: addr._id.toString() }])
  );
  const productMap = new Map(
    productsRows.map((prod) => [prod._id.toString(), { ...prod, _id: prod._id.toString() }])
  );
  const itemsByOrder = new Map();

  itemsRows.forEach((item) => {
    const orderKey = item.order.toString();
    const list = itemsByOrder.get(orderKey) ?? [];
    list.push({
      ...item,
      _id: item._id.toString(),
      product: productMap.get(item.product?.toString() ?? "") ?? null,
    });
    itemsByOrder.set(orderKey, list);
  });

  return normalizedOrders.map((order) => ({
    ...order,
    _id: order._id.toString(),
    id: order._id.toString(),
    address: addressMap.get(order.address?.toString() ?? "") ?? null,
    items: itemsByOrder.get(order._id.toString()) ?? [],
  }));
};

const insertOrderItems = async (orderId, items = []) => {
  if (!items.length) {
    return;
  }

  const values = [];
  const placeholders = items
    .map((item, index) => {
      const baseIndex = index * 3;
      values.push(orderId, item.product, item.quantity);
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
    })
    .join(", ");

  await query(
    `
      INSERT INTO order_items (order_id, product_id, quantity)
      VALUES ${placeholders}
    `,
    values
  );
};

export const placeOrderHandler = async (req, res) => {
  try {
    const userId = req.user;
    const { items, address } = req.body;
    if (!address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const productIds = Array.from(new Set(items.map((item) => item.product)));

    const productMap = await buildProductsMap(productIds);

    if (productMap.size !== productIds.length) {
      return res
        .status(404)
        .json({ success: false, message: "One or more products not found" });
    }

    const shippingAddress = await AddressModel.findOne({
      _id: address,
      user: userId,
    }).lean();

    if (!shippingAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    const baseAmount = items.reduce((acc, item) => {
      const product = productMap.get(item.product);
      return acc + product.offerPrice * item.quantity;
    }, 0);

    const amount = baseAmount + Math.floor(baseAmount * 0.02);

    const newOrder = await OrderModel.create({
      user: userId,
      amount,
      address: shippingAddress._id,
      paymentType: "COD",
    });

    await OrderItemModel.insertMany(
      items.map((item) => ({
        order: newOrder._id,
        product: item.product,
        quantity: item.quantity,
      }))
    );

    await recordTransactionLog({
      tableName: "orders",
      recordId: newOrder._id,
      operation: "ORDER_PLACED_COD",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: {
        amount,
        addressId: shippingAddress._id,
        itemCount: items.length,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Order Placed successfully" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const placeOrderStripeHandler = async (req, res) => {
  try {
    const userId = req.user;
    const { items, address } = req.body;
    const { origin } = req.headers;
    if (!address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const productIds = Array.from(new Set(items.map((item) => item.product)));
    const productMap = await buildProductsMap(productIds);

    if (productMap.size !== productIds.length) {
      return res
        .status(404)
        .json({ success: false, message: "One or more products not found" });
    }

    const shippingAddress = await AddressModel.findOne({
      _id: address,
      user: userId,
    }).lean();

    if (!shippingAddress) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    const productData = [];

    const baseAmount = items.reduce((acc, item) => {
      const product = productMap.get(item.product);
      productData.push({
        name: product.name,
        price: product.offerPrice,
        quantity: item.quantity,
      });

      return acc + product.offerPrice * item.quantity;
    }, 0);

    const amount = baseAmount + Math.floor(baseAmount * 0.02);

    const order = await OrderModel.create({
      user: userId,
      amount,
      address: shippingAddress._id,
      paymentType: "Online",
    });

    await OrderItemModel.insertMany(
      items.map((item) => ({
        order: order._id,
        product: item.product,
        quantity: item.quantity,
      }))
    );

    await recordTransactionLog({
      tableName: "orders",
      recordId: order._id,
      operation: "ORDER_PLACED_STRIPE",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: {
        amount,
        addressId: shippingAddress._id,
        itemCount: items.length,
      },
    });

    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

    const LINE_ITEMS = productData.map((item) => {
      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: item.name,
          },
          unit_amount: Math.floor(item.price + item.price * 0.02) * 100,
        },
        quantity: item.quantity,
      };
    });

    const session = await stripeInstance.checkout.sessions.create({
      line_items: LINE_ITEMS,
      mode: "payment",
      success_url: `${origin}/loader?next=my-orders`,
      cancel_url: `${origin}/cart`,
      metadata: {
        orderId: order._id.toString(),
        userId,
      },
    });

    return res.status(200).json({ success: true, url: session.url });
  } catch (error) {
    console.error("Stripe order error:", error); // Add this for more detail
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const stripeWebhook = async (req, res) => {
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`webhook error: ${error.message}`);
  }

  switch (event.type) {
    case "payment_intent_succeeded": {
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;

      // Find the session related to this payment intent
      const session = await stripeInstance.checkout.sessions.list({
        payment_intent: paymentIntentId,
      });

      if (session.data.length > 0) {
        const { orderId, userId } = session.data[0].metadata;

        await Promise.all([
          OrderModel.findByIdAndUpdate(orderId, {
            isPaid: true,
            updatedAt: new Date(),
          }),
          UserModel.findByIdAndUpdate(userId, {
            cartItems: {},
            updatedAt: new Date(),
          }),
        ]);

        await recordTransactionLog({
          tableName: "orders",
          recordId: orderId,
          operation: "ORDER_PAYMENT_CAPTURED",
          actorId: userId,
          actorRole: "system",
          description: "Stripe webhook payment confirmation",
          afterData: { isPaid: true },
        });

        await recordTransactionLog({
          tableName: "users",
          recordId: userId,
          operation: "CART_CLEARED_AFTER_PAYMENT",
          actorId: userId,
          actorRole: "system",
          description: "Stripe webhook emptied cart after payment",
        });
      }
      break;
    }
    // Add more cases if needed (e.g. payment_intent_failed)
    default:
      console.error(`Unhandled event type ${event.type}`);
      break;
  }

  res.json({ received: true });
};

export const getUserOrdersHandler = async (req, res) => {
  try {
    const userId = req.user;
    const orderList = await OrderModel.find({
      user: userId,
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .sort({ createdAt: -1 })
      .lean();

    const hydratedOrders = await attachOrderRelations(orderList);

    res.status(200).json({ success: true, orders: hydratedOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// get all orders for seller : api/order/seller

export const getSellerOrdersHandler = async (req, res) => {
  try {
    const sellerId = req.user;

    const sellerProducts = await ProductModel.find({ seller: sellerId })
      .select({ _id: 1 })
      .lean();

    const productIds = sellerProducts.map((prod) => prod._id.toString());

    if (!productIds.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const itemRows = await OrderItemModel.find({
      product: { $in: productIds },
    })
      .select({ order: 1, product: 1 })
      .lean();

    const orderIds = Array.from(new Set(itemRows.map((row) => row.order.toString())));

    if (!orderIds.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const orderList = await OrderModel.find({ _id: { $in: orderIds } })
      .sort({ createdAt: -1 })
      .lean();

    const hydratedOrders = await attachOrderRelations(orderList);

    const filteredOrders = hydratedOrders.map((order) => ({
      ...order,
      items: order.items.filter(
        (item) => item.product?.seller?.toString?.() === sellerId
      ),
    }));

    return res.status(200).json({ success: true, orders: filteredOrders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelUserOrderHandler = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user;

    if (!isValidObjectId(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    const orderRecord = await OrderModel.findById(orderId).lean();

    if (!orderRecord || orderRecord.user?.toString() !== userId) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const statusValue = (orderRecord.status || "").toLowerCase();

    if (statusValue === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Order already cancelled" });
    }

    const nonCancelableStatuses = [
      "shipped",
      "out for delivery",
      "delivered",
      "completed",
    ];

    if (nonCancelableStatuses.includes(statusValue)) {
      return res.status(400).json({
        success: false,
        message: "Order is already in fulfilment and cannot be cancelled",
      });
    }

    if (orderRecord.paymentType === "Online" && orderRecord.isPaid) {
      return res.status(400).json({
        success: false,
        message: "Paid online orders require manual support for cancellation",
      });
    }

    await OrderModel.findByIdAndUpdate(orderId, {
      status: "Cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    });

    await recordTransactionLog({
      tableName: "orders",
      recordId: orderId,
      operation: "ORDER_CANCELLED_BY_CUSTOMER",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      beforeData: { status: orderRecord.status },
      afterData: { status: "Cancelled" },
    });

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

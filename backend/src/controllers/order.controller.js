import stripe from "stripe";
import { getDb } from "../db/client.js";
import {
  orders,
  orderItems,
  products,
  addresses,
  users,
} from "../db/schema.js";
import { eq, inArray, and, or, desc } from "drizzle-orm";
import { isValidUuid } from "../utils/validators.js";

const db = () => getDb();

const buildProductsMap = async (productIds) => {
  if (!productIds.length) {
    return new Map();
  }

  const rows = await db()
    .select()
    .from(products)
    .where(and(inArray(products.id, productIds), eq(products.isArchived, false)));

  return new Map(
    rows.map((item) => [item.id, { ...item, _id: item.id }])
  );
};

const attachOrderRelations = async (ordersList) => {
  if (!ordersList.length) {
    return [];
  }

  const orderIds = ordersList.map((order) => order.id);

  const itemsRows = await db()
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds));

  const addressesRows = await db()
    .select()
    .from(addresses)
    .where(
      inArray(
        addresses.id,
        Array.from(new Set(ordersList.map((order) => order.addressId)))
      )
    );

  const productIds = Array.from(
    new Set(itemsRows.map((item) => item.productId))
  );

  const productsRows = productIds.length
    ? await db()
        .select()
        .from(products)
        .where(inArray(products.id, productIds))
    : [];

  const addressMap = new Map(addressesRows.map((addr) => [addr.id, addr]));
  const productMap = new Map(
    productsRows.map((prod) => [prod.id, { ...prod, _id: prod.id }])
  );
  const itemsByOrder = new Map();

  itemsRows.forEach((item) => {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      ...item,
      product: productMap.get(item.productId) ?? null,
    });
    itemsByOrder.set(item.orderId, list);
  });

  return ordersList.map((order) => ({
    ...order,
    address: addressMap.get(order.addressId)
      ? {
          ...addressMap.get(order.addressId),
          _id: addressMap.get(order.addressId).id,
        }
      : null,
    items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
      ...item,
      _id: item.id,
    })),
    _id: order.id,
  }));
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

    const [shippingAddress] = await db()
      .select()
      .from(addresses)
      .where(
        and(eq(addresses.id, address), eq(addresses.userId, userId))
      )
      .limit(1);

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

    const [newOrder] = await db()
      .insert(orders)
      .values({
        userId,
        amount,
        addressId: shippingAddress.id,
        paymentType: "COD",
      })
      .returning({ id: orders.id });

    await db().insert(orderItems).values(
      items.map((item) => ({
        orderId: newOrder.id,
        productId: item.product,
        quantity: item.quantity,
      }))
    );

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

    const [shippingAddress] = await db()
      .select()
      .from(addresses)
      .where(
        and(eq(addresses.id, address), eq(addresses.userId, userId))
      )
      .limit(1);

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

    const [order] = await db()
      .insert(orders)
      .values({
        userId,
        amount,
        addressId: shippingAddress.id,
        paymentType: "Online",
      })
      .returning({ id: orders.id });

    await db().insert(orderItems).values(
      items.map((item) => ({
        orderId: order.id,
        productId: item.product,
        quantity: item.quantity,
      }))
    );

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
        orderId: order.id,
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
          db()
            .update(orders)
            .set({ isPaid: true, updatedAt: new Date() })
            .where(eq(orders.id, orderId)),
          db()
            .update(users)
            .set({ cartItems: {}, updatedAt: new Date() })
            .where(eq(users.id, userId)),
        ]);
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
    const orderList = await db()
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          or(eq(orders.paymentType, "COD"), eq(orders.isPaid, true))
        )
      )
      .orderBy(desc(orders.createdAt));

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

    const itemRows = await db()
      .select({
        orderId: orderItems.orderId,
        productSellerId: products.sellerId,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(products.sellerId, sellerId));

    const orderIds = Array.from(new Set(itemRows.map((row) => row.orderId)));

    if (!orderIds.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const orderList = await db()
      .select()
      .from(orders)
      .where(inArray(orders.id, orderIds))
      .orderBy(desc(orders.createdAt));

    const hydratedOrders = await attachOrderRelations(orderList);

    const filteredOrders = hydratedOrders.map((order) => ({
      ...order,
      items: order.items.filter(
        (item) => item.product?.sellerId === sellerId
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

    if (!isValidUuid(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order id" });
    }

    const [orderRecord] = await db()
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRecord || orderRecord.userId !== userId) {
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

    await db()
      .update(orders)
      .set({ status: "Cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

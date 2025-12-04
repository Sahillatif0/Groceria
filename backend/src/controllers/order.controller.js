import stripe from "stripe";
import { query, queryOne, queryMany } from "../db/client.js";
import { isValidUuid } from "../utils/validators.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

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

const ORDER_ITEM_COLUMNS = `
  id,
  order_id,
  product_id,
  quantity,
  created_at
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
  seller_id
`;

const ADDRESS_COLUMNS = `
  id,
  user_id,
  first_name,
  last_name,
  email,
  street,
  city,
  state,
  zipcode,
  country,
  phone,
  created_at,
  updated_at
`;

const formatAddress = (record) =>
  record
    ? {
        ...record,
        _id: record.id,
      }
    : null;

const formatProduct = (record) =>
  record
    ? {
        ...record,
        _id: record.id,
      }
    : null;

const buildProductsMap = async (productIds = []) => {
  if (!productIds.length) {
    return new Map();
  }

  const rows = await queryMany(
    `
      SELECT ${PRODUCT_COLUMNS}
      FROM products
      WHERE id = ANY($1::uuid[])
        AND is_archived = false
    `,
    [productIds]
  );

  return new Map(rows.map((item) => [item.id, formatProduct(item)]));
};

const attachOrderRelations = async (ordersList = []) => {
  if (!ordersList.length) {
    return [];
  }

  const orderIds = ordersList.map((order) => order.id);

  const itemsRows = await queryMany(
    `
      SELECT ${ORDER_ITEM_COLUMNS}
      FROM order_items
      WHERE order_id = ANY($1::uuid[])
    `,
    [orderIds]
  );

  const addressIds = Array.from(
    new Set(ordersList.map((order) => order.addressId).filter(Boolean))
  );
  const addressesRows = addressIds.length
    ? await queryMany(
        `
          SELECT ${ADDRESS_COLUMNS}
          FROM addresses
          WHERE id = ANY($1::uuid[])
        `,
        [addressIds]
      )
    : [];

  const productIds = Array.from(
    new Set(itemsRows.map((item) => item.productId).filter(Boolean))
  );
  const productsRows = productIds.length
    ? await queryMany(
        `
          SELECT ${PRODUCT_COLUMNS}
          FROM products
          WHERE id = ANY($1::uuid[])
        `,
        [productIds]
      )
    : [];

  const addressMap = new Map(addressesRows.map((addr) => [addr.id, formatAddress(addr)]));
  const productMap = new Map(productsRows.map((prod) => [prod.id, formatProduct(prod)]));
  const itemsByOrder = new Map();

  itemsRows.forEach((item) => {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push({
      ...item,
      product: productMap.get(item.productId) ?? null,
      _id: item.id,
    });
    itemsByOrder.set(item.orderId, list);
  });

  return ordersList.map((order) => ({
    ...order,
    address: addressMap.get(order.addressId) ?? null,
    items: itemsByOrder.get(order.id) ?? [],
    _id: order.id,
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

    const shippingAddress = await queryOne(
      `
        SELECT ${ADDRESS_COLUMNS}
        FROM addresses
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [address, userId]
    );

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

    const newOrder = await queryOne(
      `
        INSERT INTO orders (user_id, amount, address_id, payment_type)
        VALUES ($1, $2, $3, 'COD')
        RETURNING ${ORDER_COLUMNS}
      `,
      [userId, amount, shippingAddress.id]
    );

    await insertOrderItems(newOrder.id, items);

    await recordTransactionLog({
      tableName: "orders",
      recordId: newOrder.id,
      operation: "ORDER_PLACED_COD",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: {
        amount,
        addressId: shippingAddress.id,
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

    const shippingAddress = await queryOne(
      `
        SELECT ${ADDRESS_COLUMNS}
        FROM addresses
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [address, userId]
    );

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

    const order = await queryOne(
      `
        INSERT INTO orders (user_id, amount, address_id, payment_type)
        VALUES ($1, $2, $3, 'Online')
        RETURNING ${ORDER_COLUMNS}
      `,
      [userId, amount, shippingAddress.id]
    );

    await insertOrderItems(order.id, items);

    await recordTransactionLog({
      tableName: "orders",
      recordId: order.id,
      operation: "ORDER_PLACED_STRIPE",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: {
        amount,
        addressId: shippingAddress.id,
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
          query(
            `
              UPDATE orders
              SET is_paid = true,
                  updated_at = NOW()
              WHERE id = $1
            `,
            [orderId]
          ),
          query(
            `
              UPDATE users
              SET cart_items = '{}'::jsonb,
                  updated_at = NOW()
              WHERE id = $1
            `,
            [userId]
          ),
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
    const orderList = await queryMany(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        WHERE user_id = $1
          AND (payment_type = 'COD' OR is_paid = true)
        ORDER BY created_at DESC
      `,
      [userId]
    );

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

    const itemRows = await queryMany(
      `
        SELECT DISTINCT oi.order_id AS order_id
        FROM order_items oi
        INNER JOIN products p ON oi.product_id = p.id
        WHERE p.seller_id = $1
      `,
      [sellerId]
    );

    const orderIds = itemRows.map((row) => row.orderId);

    if (!orderIds.length) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const orderList = await queryMany(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        WHERE id = ANY($1::uuid[])
        ORDER BY created_at DESC
      `,
      [orderIds]
    );

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

    const orderRecord = await queryOne(
      `
        SELECT ${ORDER_COLUMNS}
        FROM orders
        WHERE id = $1
        LIMIT 1
      `,
      [orderId]
    );

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

    await query(
      `
        UPDATE orders
        SET status = 'Cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [orderId]
    );

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

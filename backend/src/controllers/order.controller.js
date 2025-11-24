import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import stripe from "stripe";
import { User } from "../models/user.model.js";

export const placeOrderHandler = async (req, res) => {
  try {
    const userId = req.user;
    const { items, address } = req.body;
    if (!address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    let amount = await items.reduce(async (acc, item) => {
      const product = await Product.findById(item.product);
      return (await acc) + product.offerPrice * item.quantity;
    }, 0);

    amount += Math.floor(amount * 0.02);

    await Order.create({ userId, items, amount, address, paymentType: "COD" });

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

    let productData = [];

    let amount = await items.reduce(async (acc, item) => {
      const product = await Product.findById(item.product);
      productData.push({
        name: product.name,
        price: product.offerPrice,
        quantity: item.quantity,
      });
      return (await acc) + product.offerPrice * item.quantity;
    }, 0);

    amount += Math.floor(amount * 0.02);

    const order = await Order.create({
      userId,
      items,
      amount,
      address,
      paymentType: "Online",
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
        await Order.findByIdAndUpdate(orderId, { isPaid: true });
        await User.findByIdAndUpdate(userId, { cartItems: {} });
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
    const orders = await Order.find({
      userId,
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// get all orders for seller : api/order/seller

export const getAllOrdersHandler = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

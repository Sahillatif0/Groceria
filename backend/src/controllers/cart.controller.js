import { query } from "../db/client.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

export const updateCartHandler = async (req, res) => {
  try {
    const { userId, cartItems } = req.body;
    await query(
      `
        UPDATE users
        SET cart_items = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [cartItems ?? {}, userId]
    );

    await recordTransactionLog({
      tableName: "users",
      recordId: userId,
      operation: "CART_UPDATED",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: { itemCount: Object.keys(cartItems ?? {}).length },
    });
    res.status(200).json({ success: true, message: "cart updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";

const db = () => getDb();

export const updateCartHandler = async (req, res) => {
  try {
    const { userId, cartItems } = req.body;
    await db()
      .update(users)
      .set({ cartItems, updatedAt: new Date() })
      .where(eq(users.id, userId));
    res.status(200).json({ success: true, message: "cart updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

import { UserModel } from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

export const updateCartHandler = async (req, res) => {
  try {
    const { cartItems = {}, userId: userIdFromBody } = req.body;
    const userId = req.user ?? userIdFromBody;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "User context missing" });
    }

    if (userIdFromBody && req.user && userIdFromBody !== req.user) {
      return res
        .status(403)
        .json({ success: false, message: "User mismatch" });
    }

    if (!isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user id" });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { cartItems, updatedAt: new Date() },
      { new: true, lean: true }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

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

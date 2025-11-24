import { User } from "../models/user.model.js";

export const updateCartHandler = async (req, res) => {
  try {
    const { userId, cartItems } = req.body;
    await User.findByIdAndUpdate(userId, { cartItems });
    res.status(200).json({ success: true, message: "cart updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

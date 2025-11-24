import { Address } from "../models/address.model.js";

export const addAddressHandler = async (req, res) => {
  try {
    const userId = req.user; // Use authenticated user ID
    const { address } = req.body;
    await Address.create({ ...address, userId });
    res.status(200).json({
      success: true,
      message: "Address added successfully",
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAddressHandler = async (req, res) => {
  try {
    const userId = req.user;
    const addresses = await Address.find({ userId });
    res.status(200).json({ success: true, addresses });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

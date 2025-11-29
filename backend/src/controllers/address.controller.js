import { AddressModel } from "../models/index.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

export const addAddressHandler = async (req, res) => {
  try {
    const userId = req.user; // Use authenticated user ID
    const { address } = req.body;
    const createdAddress = await AddressModel.create({ ...address, user: userId });

    await recordTransactionLog({
      tableName: "addresses",
      recordId: createdAddress._id,
      operation: "ADDRESS_CREATED",
      actorId: userId,
      actorRole: req.userRole ?? "customer",
      afterData: {
        firstName: createdAddress.firstName,
        lastName: createdAddress.lastName,
        city: createdAddress.city,
        country: createdAddress.country,
      },
    });

    res.status(200).json({
      success: true,
      message: "Address added successfully",
      address: {
        ...createdAddress,
        _id: createdAddress._id.toString(),
      },
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAddressHandler = async (req, res) => {
  try {
    const userId = req.user;
    const userAddresses = await AddressModel.find({ user: userId }).lean();

    const formatted = userAddresses.map((item) => ({
      ...item,
      _id: item._id.toString(),
      id: item._id.toString(),
    }));

    res.status(200).json({ success: true, addresses: formatted });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

import { addresses as addressesTable } from "../db/schema.js";
import { getDb } from "../db/client.js";
import { eq } from "drizzle-orm";

const db = () => getDb();

export const addAddressHandler = async (req, res) => {
  try {
    const userId = req.user; // Use authenticated user ID
    const { address } = req.body;
    const [createdAddress] = await db()
      .insert(addressesTable)
      .values({ ...address, userId })
      .returning();

    res.status(200).json({
      success: true,
      message: "Address added successfully",
      address: {
        ...createdAddress,
        _id: createdAddress.id,
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
    const userAddresses = await db()
      .select()
      .from(addressesTable)
      .where(eq(addressesTable.userId, userId));

    const formatted = userAddresses.map((item) => ({
      ...item,
      _id: item.id,
    }));

    res.status(200).json({ success: true, addresses: formatted });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

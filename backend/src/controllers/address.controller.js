import { queryOne, queryMany } from "../db/client.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

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

export const addAddressHandler = async (req, res) => {
  try {
    const userId = req.user; // Use authenticated user ID
    const { address } = req.body;
    const createdAddress = await queryOne(
      `
        INSERT INTO addresses (
          user_id,
          first_name,
          last_name,
          email,
          street,
          city,
          state,
          zipcode,
          country,
          phone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING ${ADDRESS_COLUMNS}
      `,
      [
        userId,
        address?.firstName,
        address?.lastName,
        address?.email,
        address?.street,
        address?.city,
        address?.state,
        address?.zipcode,
        address?.country,
        address?.phone,
      ]
    );

    await recordTransactionLog({
      tableName: "addresses",
      recordId: createdAddress.id,
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
      address: formatAddress(createdAddress),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAddressHandler = async (req, res) => {
  try {
    const userId = req.user;
    const userAddresses = await queryMany(
      `
        SELECT ${ADDRESS_COLUMNS}
        FROM addresses
        WHERE user_id = $1
      `,
      [userId]
    );

    const formatted = userAddresses.map(formatAddress);

    res.status(200).json({ success: true, addresses: formatted });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

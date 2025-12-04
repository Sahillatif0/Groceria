import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { queryOne, withTransaction } from "../db/client.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const { password, ...rest } = userRecord;
  return {
    ...rest,
    _id: userRecord.id,
  };
};

const sanitizeSellerProfile = (profileRecord) => {
  if (!profileRecord) {
    return null;
  }

  return {
    ...profileRecord,
    _id: profileRecord.id,
  };
};

const signAuthCookies = (res, payload) => {
  const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  res.cookie("token", token, cookieOptions);
  res.cookie("sellerToken", token, cookieOptions);

  return token;
};

export const sellerLoginHandler = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });
    }

    const userRecord = await queryOne(
      `
        SELECT id, name, email, password, role, is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (!userRecord || !["seller", "admin"].includes(userRecord.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Seller account not found" });
    }

    if (!userRecord.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Seller account inactive" });
    }

    const isMatch = await bcrypt.compare(password, userRecord.password);

    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    const sellerProfile = await queryOne(
      `
        SELECT id, user_id, display_name, status, deactivated_at
        FROM sellers
        WHERE user_id = $1
        LIMIT 1
      `,
      [userRecord.id]
    );

    const token = signAuthCookies(res, {
      id: userRecord.id,
      role: userRecord.role,
    });

    return res.status(200).json({
      success: true,
      message: "Seller logged in successfully",
      token,
      user: sanitizeUser(userRecord),
      sellerProfile: sanitizeSellerProfile(sellerProfile),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sellerRegisterHandler = async (req, res) => {
  try {
    const { name, email, password, displayName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const normalizedDisplayName = displayName?.trim() || name;

    const existingUser = await queryOne(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Account already exists for this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { createdUser, createdSeller } = await withTransaction(
      async ({ queryOne: txQueryOne }) => {
        const user = await txQueryOne(
          `
            INSERT INTO users (name, email, password, role, is_active)
            VALUES ($1, $2, $3, 'seller', true)
            RETURNING id, name, email, role, is_active
          `,
          [name, email, hashedPassword]
        );

        const seller = await txQueryOne(
          `
            INSERT INTO sellers (user_id, display_name, status)
            VALUES ($1, $2, 'pending')
            RETURNING id, user_id, display_name, status
          `,
          [user.id, normalizedDisplayName]
        );

        return { createdUser: user, createdSeller: seller };
      }
    );

    await recordTransactionLog({
      tableName: "users",
      recordId: createdUser.id,
      operation: "SELLER_USER_CREATED",
      actorId: createdUser.id,
      actorRole: createdUser.role,
      afterData: {
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
      },
    });

    await recordTransactionLog({
      tableName: "sellers",
      recordId: createdSeller.id,
      operation: "SELLER_PROFILE_CREATED",
      actorId: createdUser.id,
      actorRole: createdUser.role,
      afterData: {
        displayName: createdSeller.displayName,
        status: createdSeller.status,
      },
    });

    const token = signAuthCookies(res, {
      id: createdUser.id,
      role: createdUser.role,
    });

    return res.status(201).json({
      success: true,
      message: "Seller account created. Await admin approval",
      token,
      user: sanitizeUser(createdUser),
      sellerProfile: sanitizeSellerProfile(createdSeller),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const isSellerAuth = async (req, res) => {
  try {
    const profile = await queryOne(
      `
        SELECT id, user_id, display_name, status, created_at, updated_at
        FROM sellers
        WHERE user_id = $1
        LIMIT 1
      `,
      [req.user]
    );

    return res
      .status(200)
      .json({ success: true, user: req.currentUser, sellerProfile: profile });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const profile = await queryOne(
      `
        SELECT id, user_id, display_name, status, created_at, updated_at
        FROM sellers
        WHERE user_id = $1
        LIMIT 1
      `,
      [req.user]
    );

    return res.status(200).json({
      success: true,
      user: req.currentUser,
      sellerProfile: profile ?? null,
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sellerLogoutHandler = async (req, res) => {
  try {
    res.clearCookie("sellerToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    return res
      .status(200)
      .json({ success: true, message: "Seller Logged Out" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getDb } from "../db/client.js";
import { users, sellers } from "../db/schema.js";
import { eq } from "drizzle-orm";

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

    const [userRecord] = await getDb()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

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

    const [sellerProfile] = await getDb()
      .select()
      .from(sellers)
      .where(eq(sellers.userId, userRecord.id))
      .limit(1);

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

    const dbClient = getDb();

    const [existingUser] = await dbClient
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Account already exists for this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [createdUser] = await dbClient
      .insert(users)
      .values({
        name,
        email,
        password: hashedPassword,
        role: "seller",
        isActive: true,
      })
      .returning();

    const [createdSeller] = await dbClient
      .insert(sellers)
      .values({
        userId: createdUser.id,
        displayName: normalizedDisplayName,
        status: "pending",
      })
      .returning();

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
    const [profile] = await getDb()
      .select()
      .from(sellers)
      .where(eq(sellers.userId, req.user))
      .limit(1);

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
    const [profile] = await getDb()
      .select()
      .from(sellers)
      .where(eq(sellers.userId, req.user))
      .limit(1);

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

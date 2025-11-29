import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { UserModel, SellerModel } from "../models/index.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const sanitizeUser = (userRecord) => {
  if (!userRecord) {
    return null;
  }

  const payload = userRecord.toObject ? userRecord.toObject() : userRecord;
  const { password, ...rest } = payload;
  const id = payload._id?.toString?.() ?? payload.id?.toString?.();
  return {
    ...rest,
    _id: id,
    id,
  };
};

const sanitizeSellerProfile = (profileRecord) => {
  if (!profileRecord) {
    return null;
  }

  const payload = profileRecord.toObject
    ? profileRecord.toObject()
    : profileRecord;
  const id = payload._id?.toString?.() ?? payload.id?.toString?.();

  return {
    ...payload,
    _id: id,
    id,
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

    const userRecord = await UserModel.findOne({ email });

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

    const sellerProfile = await SellerModel.findOne({ user: userRecord._id }).lean();

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

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Account already exists for this email",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await UserModel.create({
      name,
      email,
      password: hashedPassword,
      role: "seller",
      isActive: true,
    });

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

    const createdSeller = await SellerModel.create({
      user: createdUser._id,
      displayName: normalizedDisplayName,
      status: "pending",
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
    const profile = await SellerModel.findOne({ user: req.user }).lean();

    return res
      .status(200)
      .json({
        success: true,
        user: req.currentUser,
        sellerProfile: sanitizeSellerProfile(profile),
      });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const profile = await SellerModel.findOne({ user: req.user }).lean();

    return res.status(200).json({
      success: true,
      user: req.currentUser,
      sellerProfile: sanitizeSellerProfile(profile),
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

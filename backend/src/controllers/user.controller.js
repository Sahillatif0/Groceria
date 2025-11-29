import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { UserModel } from "../models/index.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const toPublicUser = (userRecord) => {
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

export const registerHandler = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "invalid credentials" });
    }

    const existedUser = await UserModel.findOne({ email }).lean();

    if (existedUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await UserModel.create({ name, email, password: hashedPassword });

    await recordTransactionLog({
      tableName: "users",
      recordId: createdUser._id,
      operation: "USER_REGISTERED",
      actorId: createdUser._id,
      actorRole: createdUser.role,
      afterData: {
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
      },
    });

    const token = jwt.sign(
      { id: createdUser._id.toString(), role: createdUser.role },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 day in milliseconds
    });

    return res.status(201).json({
      success: true,
      user: toPublicUser(createdUser),
      message: "User registered successfully",
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginHandler = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and Password required" });
    }

    const user = await UserModel.findOne({ email }).lean();

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is inactive" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Password does not matched" });
    }

    const token = jwt.sign({ id: user._id.toString(), role: user.role }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 day in milliseconds
    });

    return res.status(201).json({
      success: true,
      user: toPublicUser(user),
      message: "User LoggedIn successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const isAuth = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user).lean();

    return res.status(200).json({ success: true, user: toPublicUser(user) });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const logoutHandler = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    return res.json({ success: true, message: "User Logged Out" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

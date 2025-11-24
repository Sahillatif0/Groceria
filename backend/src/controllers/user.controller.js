import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const db = () => getDb();

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

export const registerHandler = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "invalid credentials" });
    }

    const [existedUser] = await db()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existedUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [createdUser] = await db()
      .insert(users)
      .values({ name, email, password: hashedPassword })
      .returning();

    const token = jwt.sign(
      { id: createdUser.id, role: createdUser.role },
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
      user: {
        name: createdUser.name,
        email: createdUser.email,
        _id: createdUser.id,
        id: createdUser.id,
        role: createdUser.role,
      },
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

    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

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

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, {
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
      user: {
        name: user.name,
        email: user.email,
        _id: user.id,
        id: user.id,
        role: user.role,
      },
      message: "User LoggedIn successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const isAuth = async (req, res) => {
  try {
    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.id, req.user))
      .limit(1);

    return res.status(200).json({ success: true, user: sanitizeUser(user) });
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

import mongoose from "mongoose";
import { USER_ROLES } from "./constants.js";

const { Schema } = mongoose;

const userSchema = new Schema(
	{
		name: { type: String, required: true, trim: true },
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		password: { type: String, required: true },
		cartItems: { type: Schema.Types.Mixed, default: {} },
		role: { type: String, enum: USER_ROLES, default: "customer" },
		isActive: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

export const UserModel =
	mongoose.models.User ?? mongoose.model("User", userSchema);

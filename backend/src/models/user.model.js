import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: [true, "Password is required"] },
    cartItems: { type: Object, default: {} },
  },
  { timestamps: true, minimize: false } // Disable minimization to keep empty objects in cartItems
);

// userSchema.pre("save", async function (next) {
//   if (this.isModified("password")) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   return next();
// });

// userSchema.methods.isPasswordCorrect = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// userSchema.methods.generateAccessToken = async function () {
//   return jwt.sign(
//     { _id: this._id, name: this.name, email: this.email },
//     process.env.ACCESS_TOKEN_SECRET,
//     {
//       expiresIn: "1d",
//     }
//   );
// };

// userSchema.methods.generateRefreshToken = async function () {
//   return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: "7d",
//   });
// };

export const User = mongoose.models.User || mongoose.model("User", userSchema);

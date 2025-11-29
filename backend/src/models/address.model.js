import mongoose from "mongoose";

const { Schema } = mongoose;

const addressSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: "User", required: true },
		firstName: { type: String, required: true, trim: true },
		lastName: { type: String, required: true, trim: true },
		email: { type: String, required: true, trim: true },
		street: { type: String, required: true, trim: true },
		city: { type: String, required: true, trim: true },
		state: { type: String, required: true, trim: true },
		zipcode: { type: Number, required: true },
		country: { type: String, required: true, trim: true },
		phone: { type: String, required: true, trim: true },
	},
	{ timestamps: true }
);

export const AddressModel =
	mongoose.models.Address ?? mongoose.model("Address", addressSchema);

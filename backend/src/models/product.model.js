import mongoose from "mongoose";

const { Schema } = mongoose;

const productSchema = new Schema(
	{
		name: { type: String, required: true, trim: true },
		description: { type: [String], default: [] },
		price: { type: Number, required: true },
		offerPrice: { type: Number, required: true },
		image: { type: [String], default: [] },
		category: { type: String, required: true, trim: true },
		inStock: { type: Boolean, default: true },
		isArchived: { type: Boolean, default: false },
		seller: { type: Schema.Types.ObjectId, ref: "User", default: null },
	},
	{ timestamps: true }
);

export const ProductModel =
	mongoose.models.Product ?? mongoose.model("Product", productSchema);

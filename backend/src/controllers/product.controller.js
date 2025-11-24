import { Product } from "../models/product.model.js";
import { v2 as cloudinary } from "cloudinary";
// import { uploadOnCloudinary } from "../utils/cdn.cloudinary.js";

export const addProductHandler = async (req, res) => {
  try {
    let productData = JSON.parse(req.body.productData);
    const images = req.files;

    let imagesUrl = await Promise.all(
      images.map(async (item) => {
        let result = await cloudinary.uploader.upload(item.path, {resource_type: "image"});
        return result.secure_url;
      })
    );

    await Product.create({
      ...productData,
      image: imagesUrl,
    });

    res
      .status(200)
      .json({ success: true, message: "Product added successfully" });
  } catch (error) {
    console.error("Error adding product:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
export const productListHandler = async (req, res) => {
  try {
    const products = await Product.find({});
    res.status(200).json({ success: true, products });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const productByIdtHandler = async (req, res) => {
  try {
    const { id } = req.body;

    const product = await Product.findById(id);
    res.status(200).json({ success: true, product });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
export const updateProductHandler = async (req, res) => {
  try {
    const { id, inStock } = req.body;

    await Product.findByIdAndUpdate(id, { inStock });
    res.status(200).json({ success: true, message: "Stock updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

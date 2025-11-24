import { v2 as cloudinary } from "cloudinary";
import { getDb } from "../db/client.js";
import { products as productsTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { isValidUuid } from "../utils/validators.js";

const db = () => getDb();

const formatProduct = (product) =>
  product
    ? {
        ...product,
        _id: product.id,
      }
    : null;

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

    const [createdProduct] = await db()
      .insert(productsTable)
      .values({
        name: productData.name,
        description: productData.description,
        price: productData.price,
        offerPrice: productData.offerPrice,
        image: imagesUrl,
        category: productData.category,
        inStock: productData?.inStock ?? true,
      })
      .returning();

    res
      .status(200)
      .json({
        success: true,
        message: "Product added successfully",
        product: formatProduct(createdProduct),
      });
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
    const products = await db().select().from(productsTable);
    res.status(200).json({
      success: true,
      products: products.map(formatProduct),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const productByIdtHandler = async (req, res) => {
  try {
    const { id } = req.body;

    if (!isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const [product] = await db()
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);
    res.status(200).json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
export const updateProductHandler = async (req, res) => {
  try {
    const { id, inStock } = req.body;

    if (!isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    await db()
      .update(productsTable)
      .set({ inStock, updatedAt: new Date() })
      .where(eq(productsTable.id, id));
    res.status(200).json({ success: true, message: "Stock updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

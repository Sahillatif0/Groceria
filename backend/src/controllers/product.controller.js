import { v2 as cloudinary } from "cloudinary";
import { queryOne, queryMany } from "../db/client.js";
import { isValidUuid } from "../utils/validators.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";
import { buildUpdateSet } from "../utils/sql.js";

const PRODUCT_COLUMNS = `
  id,
  name,
  description,
  price,
  offer_price,
  image,
  category,
  in_stock,
  is_archived,
  seller_id,
  created_at,
  updated_at
`;

const formatProduct = (product) =>
  product
    ? {
        ...product,
        _id: product.id,
      }
    : null;

const normalizeDescription = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return fallback;
};

const normalizeInStock = (value, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return fallback;
};

const normalizeExistingImages = (images) => {
  if (images === undefined) {
    return undefined;
  }

  if (Array.isArray(images)) {
    return images.filter(
      (item) => typeof item === "string" && item.trim().length > 0
    );
  }

  if (typeof images === "string" && images.trim().length > 0) {
    return [images.trim()];
  }

  return [];
};

const uploadImages = async (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  return Promise.all(
    files.map(async (file) => {
      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: "image",
      });
      return result.secure_url;
    })
  );
};

export const addProductHandler = async (req, res) => {
  try {
    const rawPayload = req.body?.productData;
    if (!rawPayload) {
      return res
        .status(400)
        .json({ success: false, message: "Product data is required" });
    }

    let productData;
    try {
      productData = JSON.parse(rawPayload);
    } catch (error) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product payload" });
    }

    const imagesUrl = await uploadImages(req.files);

    const sellerId =
      req.userRole === "admin"
        ? productData?.sellerId ?? null
        : req.user ?? null;

    const normalizedDescription = normalizeDescription(
      productData.description
    );

    const priceValue = Number(productData.price);
    const offerValue = Number(productData.offerPrice);

    if (Number.isNaN(priceValue) || Number.isNaN(offerValue)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid price values" });
    }

    const inStock = normalizeInStock(productData?.inStock, true);

    const createdProduct = await queryOne(
      `
        INSERT INTO products (
          name,
          description,
          price,
          offer_price,
          image,
          category,
          in_stock,
          seller_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING ${PRODUCT_COLUMNS}
      `,
      [
        productData.name,
        normalizedDescription,
        priceValue,
        offerValue,
        imagesUrl,
        productData.category,
        inStock,
        sellerId,
      ]
    );

    await recordTransactionLog({
      tableName: "products",
      recordId: createdProduct.id,
      operation: "PRODUCT_CREATED",
      actorId: req.user ?? null,
      actorRole: req.userRole ?? "seller",
      afterData: {
        name: createdProduct.name,
        category: createdProduct.category,
        price: createdProduct.price,
        sellerId: createdProduct.sellerId,
      },
    });

    res.status(200).json({
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
    const products = await queryMany(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE is_archived = false`
    );

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
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const product = await queryOne(
      `
        SELECT ${PRODUCT_COLUMNS}
        FROM products
        WHERE id = $1
          AND is_archived = false
        LIMIT 1
      `,
      [id]
    );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProductHandler = async (req, res) => {
  try {
    const productId = req.params?.id ?? req.body?.id;
    const rawPayload =
      typeof req.body?.productData === "string" ? req.body.productData : null;

    let parsedUpdates = {};
    if (rawPayload) {
      try {
        parsedUpdates = JSON.parse(rawPayload);
      } catch (error) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid product payload" });
      }
    }

    const incoming = rawPayload ? parsedUpdates : req.body ?? {};
    const { id: _ignoredId, existingImages, ...updates } = incoming;

    if (!isValidUuid(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await queryOne(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 LIMIT 1`,
      [productId]
    );

    if (!productRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (productRecord.isArchived) {
      return res
        .status(400)
        .json({ success: false, message: "Product is archived" });
    }

    if (
      req.userRole === "seller" &&
      productRecord.sellerId &&
      productRecord.sellerId !== req.user
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to modify product" });
    }

    const payload = { updatedAt: new Date() };

    const normalizedImages = normalizeExistingImages(existingImages);

    if (updates.name !== undefined) {
      payload.name = updates.name;
    }

    if (updates.description !== undefined) {
      payload.description = normalizeDescription(
        updates.description,
        productRecord.description
      );
    }

    if (updates.price !== undefined) {
      const numericPrice = Number(updates.price);
      if (Number.isNaN(numericPrice)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid price value" });
      }
      payload.price = numericPrice;
    }

    if (updates.offerPrice !== undefined) {
      const numericOffer = Number(updates.offerPrice);
      if (Number.isNaN(numericOffer)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid offer price" });
      }
      payload.offerPrice = numericOffer;
    }

    if (updates.category !== undefined) {
      payload.category = updates.category;
    }

    if (updates.inStock !== undefined) {
      payload.inStock = normalizeInStock(updates.inStock, productRecord.inStock);
    }

    if (req.userRole === "admin" && updates.sellerId !== undefined) {
      payload.sellerId = updates.sellerId;
    }

    const uploadedImages = await uploadImages(req.files);

    if (normalizedImages !== undefined || uploadedImages.length > 0) {
      const currentImages = normalizedImages ?? productRecord.image ?? [];
      payload.image = [...currentImages, ...uploadedImages];
    }

    const { clauses, values } = buildUpdateSet(payload);

    if (!clauses.length) {
      return res
        .status(400)
        .json({ success: false, message: "No valid fields supplied" });
    }

    const updatedProduct = await queryOne(
      `
        UPDATE products
        SET ${clauses.join(", ")}
        WHERE id = $${clauses.length + 1}
        RETURNING ${PRODUCT_COLUMNS}
      `,
      [...values, productId]
    );

    await recordTransactionLog({
      tableName: "products",
      recordId: productId,
      operation: "PRODUCT_UPDATED",
      actorId: req.user ?? null,
      actorRole: req.userRole ?? null,
      beforeData: {
        name: productRecord.name,
        price: productRecord.price,
        offerPrice: productRecord.offerPrice,
        inStock: productRecord.inStock,
      },
      afterData: {
        name: updatedProduct.name,
        price: updatedProduct.price,
        offerPrice: updatedProduct.offerPrice,
        inStock: updatedProduct.inStock,
      },
    });

    res.status(200).json({ success: true, message: "Product updated" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteProductHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await queryOne(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (!productRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (productRecord.isArchived) {
      return res
        .status(400)
        .json({ success: false, message: "Product already archived" });
    }

    if (
      req.userRole === "seller" &&
      productRecord.sellerId &&
      productRecord.sellerId !== req.user
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to delete product" });
    }

    const archivedProduct = await queryOne(
      `
        UPDATE products
        SET is_archived = true,
            updated_at = NOW()
        WHERE id = $1
        RETURNING ${PRODUCT_COLUMNS}
      `,
      [id]
    );

    await recordTransactionLog({
      tableName: "products",
      recordId: archivedProduct.id,
      operation: "PRODUCT_ARCHIVED",
      actorId: req.user ?? null,
      actorRole: req.userRole ?? null,
      beforeData: { isArchived: productRecord.isArchived },
      afterData: { isArchived: archivedProduct.isArchived },
    });

    return res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const productListForSellerHandler = async (req, res) => {
  try {
    const sellerId = req.user;

    const products = await queryMany(
      `
        SELECT ${PRODUCT_COLUMNS}
        FROM products
        WHERE is_archived = false
          AND seller_id = $1
      `,
      [sellerId]
    );

    res.status(200).json({
      success: true,
      products: products.map(formatProduct),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

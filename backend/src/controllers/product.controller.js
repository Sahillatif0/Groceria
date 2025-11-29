import { v2 as cloudinary } from "cloudinary";
import { ProductModel } from "../models/index.js";
import { isValidObjectId } from "../utils/validators.js";
import { recordTransactionLog } from "../utils/transactionLogger.js";

const toPlain = (doc) => (doc?.toObject ? doc.toObject() : doc) ?? null;

const formatProduct = (productDoc) => {
  const payload = toPlain(productDoc);
  if (!payload) {
    return null;
  }

  const id = payload._id?.toString?.() ?? payload.id?.toString?.();
  const normalizedSellerId =
    payload.seller?._id?.toString?.() ??
    payload.seller?.toString?.() ??
    payload.sellerId?.toString?.() ??
    null;

  return {
    ...payload,
    _id: id,
    id,
    seller: normalizedSellerId ?? payload.seller,
    sellerId: normalizedSellerId,
  };
};

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

    const sellerId =
      req.userRole === "admin"
        ? productData?.sellerId ?? null
        : req.user;

    const normalizedDescription = Array.isArray(productData.description)
      ? productData.description
      : typeof productData.description === "string"
      ? productData.description.split("\n").map((item) => item.trim()).filter(Boolean)
      : [];

    const priceValue = Number(productData.price);
    const offerValue = Number(productData.offerPrice);

    if (Number.isNaN(priceValue) || Number.isNaN(offerValue)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid price values" });
    }

    const createdProduct = await ProductModel.create({
      name: productData.name,
      description: normalizedDescription,
      price: priceValue,
      offerPrice: offerValue,
      image: imagesUrl,
      category: productData.category,
      inStock: productData?.inStock ?? true,
      seller: sellerId,
    });

    await recordTransactionLog({
      tableName: "products",
      recordId: createdProduct._id,
      operation: "PRODUCT_CREATED",
      actorId: req.user ?? null,
      actorRole: req.userRole ?? "seller",
      afterData: {
        name: createdProduct.name,
        category: createdProduct.category,
        price: createdProduct.price,
        sellerId: createdProduct.seller,
      },
    });

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
    const products = await ProductModel.find({ isArchived: false }).lean();
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

    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const product = await ProductModel.findOne({
      _id: id,
      isArchived: false,
    }).lean();
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

    if (!isValidObjectId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await ProductModel.findById(productId).lean();

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
      productRecord.seller &&
      productRecord.seller.toString() !== req.user
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to modify product" });
    }

    const payload = { updatedAt: new Date() };

    let normalizedImages;
    if (existingImages !== undefined) {
      if (Array.isArray(existingImages)) {
        normalizedImages = existingImages.filter(
          (item) => typeof item === "string" && item.trim().length > 0
        );
      } else if (typeof existingImages === "string" && existingImages.trim().length > 0) {
        normalizedImages = [existingImages.trim()];
      } else {
        normalizedImages = [];
      }
    }

    if (updates.name !== undefined) {
      payload.name = updates.name;
    }

    if (updates.description !== undefined) {
      payload.description = Array.isArray(updates.description)
        ? updates.description
        : typeof updates.description === "string"
        ? updates.description
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : productRecord.description;
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
      if (typeof updates.inStock === "boolean") {
        payload.inStock = updates.inStock;
      } else if (typeof updates.inStock === "string") {
        payload.inStock = updates.inStock.toLowerCase() === "true";
      }
    }

    if (req.userRole === "admin" && updates.sellerId !== undefined) {
      payload.seller = updates.sellerId;
    }

    const uploadedImages = Array.isArray(req.files)
      ? await Promise.all(
          req.files.map(async (file) => {
            const result = await cloudinary.uploader.upload(file.path, {
              resource_type: "image",
            });
            return result.secure_url;
          })
        )
      : [];

    if (normalizedImages !== undefined || uploadedImages.length > 0) {
      const currentImages = normalizedImages ?? productRecord.image ?? [];
      const finalImages = [...currentImages, ...uploadedImages];
      payload.image = finalImages;
    }

    const updatedProduct = await ProductModel.findByIdAndUpdate(
      productId,
      payload,
      { new: true, lean: true }
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

    if (!isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product id" });
    }

    const productRecord = await ProductModel.findById(id).lean();

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
      productRecord.seller &&
      productRecord.seller.toString() !== req.user
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to delete product" });
    }

    if (productRecord.isArchived) {
      return res
        .status(400)
        .json({ success: false, message: "Product already archived" });
    }

    const archivedProduct = await ProductModel.findByIdAndUpdate(
      id,
      { isArchived: true, updatedAt: new Date() },
      { new: true, lean: true }
    );

    await recordTransactionLog({
      tableName: "products",
      recordId: archivedProduct._id,
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

    const products = await ProductModel.find({
      isArchived: false,
      seller: sellerId,
    }).lean();

    res.status(200).json({
      success: true,
      products: products.map(formatProduct),
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

import express from "express";
import { upload } from "../utils/multer.js";
import {
  addProductHandler,
  productByIdtHandler,
  productListHandler,
  updateProductHandler,
  deleteProductHandler,
  productListForSellerHandler,
} from "../controllers/product.controller.js";
import { authSeller } from "../middlewares/authSeller.js";

const router = express.Router();

// also add authseller in first and last wale me

router
  .route("/add")
  .post(authSeller, upload.array("images", 6), addProductHandler);
router.route("/list").get(productListHandler);
router.route("/mine").get(authSeller, productListForSellerHandler);
router.route("/stock").post(authSeller, updateProductHandler);
router
  .route("/:id")
  .get(productByIdtHandler)
  .patch(authSeller, upload.array("images", 6), updateProductHandler)
  .delete(authSeller, deleteProductHandler);

export default router;

import express from "express";
import { upload } from "../utils/multer.js";
import {
  addProductHandler,
  productByIdtHandler,
  productListHandler,
  updateProductHandler,
} from "../controllers/product.controller.js";
import { authSeller } from "../middlewares/authSeller.js";

const router = express.Router();

// also add authseller in first and last wale me

router
  .route("/add")
  .post(upload.array(["images"]), authSeller, addProductHandler);
router.route("/list").get(productListHandler);
router.route("id").get(productByIdtHandler);
router.route("/stock").post(authSeller, updateProductHandler);

export default router;

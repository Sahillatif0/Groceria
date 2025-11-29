import express from "express";
import { authAdmin } from "../middlewares/authAdmin.js";
import {
  getUsersAdminHandler,
  getSellersAdminHandler,
  createSellerAdminHandler,
  promoteUserToSellerHandler,
  deleteUserAdminHandler,
  deleteSellerAdminHandler,
  deleteProductAdminHandler,
  deleteOrderAdminHandler,
  getProductsAdminHandler,
  getOrdersAdminHandler,
  updateSellerStatusAdminHandler,
  updateUserStatusAdminHandler,
  updateOrderStatusAdminHandler,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.use(authAdmin);

router.get("/users", getUsersAdminHandler);
router.patch("/users/:userId/status", updateUserStatusAdminHandler);
router.delete("/users/:userId", deleteUserAdminHandler);

router.get("/sellers", getSellersAdminHandler);
router.post("/sellers", createSellerAdminHandler);
router.post("/sellers/promote", promoteUserToSellerHandler);
router.patch("/sellers/:sellerId/status", updateSellerStatusAdminHandler);
router.delete("/sellers/:sellerId", deleteSellerAdminHandler);

router.get("/products", getProductsAdminHandler);
router.delete("/products/:productId", deleteProductAdminHandler);

router.get("/orders", getOrdersAdminHandler);
router.patch("/orders/:orderId/status", updateOrderStatusAdminHandler);
router.delete("/orders/:orderId", deleteOrderAdminHandler);

export default router;

import express from "express";
import {
  getSellerOrdersHandler,
  getUserOrdersHandler,
  placeOrderHandler,
  placeOrderStripeHandler,
  cancelUserOrderHandler,
} from "../controllers/order.controller.js";
import { authUser } from "../middlewares/authUser.middleware.js";
import { authSeller } from "../middlewares/authSeller.js";

const router = express.Router();

// add authuser in 1st and second and then in 3rd add authseller and in 4th add authUser
router.route("/cod").post(authUser, placeOrderHandler);
router.route("/user").get(authUser, getUserOrdersHandler);
router.route("/seller").get(authSeller, getSellerOrdersHandler);
router.route("/stripe").post(authUser, placeOrderStripeHandler);
router.route("/:orderId/cancel").patch(authUser, cancelUserOrderHandler);

export default router;

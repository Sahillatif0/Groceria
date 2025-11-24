import express from "express";
import { updateCartHandler } from "../controllers/cart.controller.js";
import { authUser } from "../middlewares/authUser.middleware.js";

const router = express.Router();

// add authUser befor the updatecarthandler

router.route("/update").post(authUser, updateCartHandler);

export default router;

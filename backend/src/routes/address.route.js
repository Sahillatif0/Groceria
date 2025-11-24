import express from "express";
import {
  addAddressHandler,
  getAddressHandler,
} from "../controllers/address.controller.js";
import { authUser } from "../middlewares/authUser.middleware.js";

const router = express.Router();

// add authuser in both of them
router.route("/add").post(authUser, addAddressHandler);
router.route("/get").get(authUser, getAddressHandler);

export default router;

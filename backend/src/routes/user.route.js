import express from "express";
import {
  isAuth,
  loginHandler,
  logoutHandler,
  registerHandler,
} from "../controllers/user.controller.js";
import { authUser } from "../middlewares/authUser.middleware.js";

const router = express.Router();

router.route("/register").post(registerHandler);
router.route("/login").post(loginHandler);
router.route("/is-auth").get(authUser, isAuth);
router.route("/logout").get(authUser, logoutHandler);
// router.route("/refresh-token").post(refreshAccessToken);

export default router;

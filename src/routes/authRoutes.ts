import { Router } from "express";
import * as authController from "../controllers/authController.js";

const router = Router();

router.post("/login", authController.loginHandler);
router.post(
  "/request-password-reset",
  authController.requestPasswordResetHandler
);
router.post("/reset-password", authController.resetPasswordHandler);

export default router;

import { Router } from "express";
import employeeRoutes from "./employeeRoutes.js";
import authRoutes from "./authRoutes.js";
import roleRoutes from "./roleRoutes.js";
import clientRoutes from "./clientRoutes.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Public routes (no authentication required)
router.use("/auth", authRoutes);

// Protected routes (authentication required)
router.use("/employees", authenticate, employeeRoutes);
router.use("/roles", authenticate, roleRoutes);
router.use("/clients", authenticate, clientRoutes);

export default router;

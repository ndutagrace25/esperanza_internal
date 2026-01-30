import { Router } from "express";
import employeeRoutes from "./employeeRoutes.js";
import authRoutes from "./authRoutes.js";
import roleRoutes from "./roleRoutes.js";
import clientRoutes from "./clientRoutes.js";
import productCategoryRoutes from "./productCategoryRoutes.js";
import productRoutes from "./productRoutes.js";
import jobCardRoutes from "./jobCardRoutes.js";
import saleRoutes from "./saleRoutes.js";
import expenseRoutes from "./expenseRoutes.js";
import clientIntegrationRoutes from "./clientIntegrationRoutes.js";
import smsRoutes from "./smsRoutes.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Public routes (no authentication required)
router.use("/auth", authRoutes);

// Protected routes (authentication required)
router.use("/employees", authenticate, employeeRoutes);
router.use("/roles", authenticate, roleRoutes);
router.use("/clients", authenticate, clientRoutes);
router.use("/client-integrations", authenticate, clientIntegrationRoutes);
router.use("/sms", authenticate, smsRoutes);
router.use("/product-categories", authenticate, productCategoryRoutes);
router.use("/products", authenticate, productRoutes);
router.use("/job-cards", authenticate, jobCardRoutes);
router.use("/sales", authenticate, saleRoutes);
router.use("/expenses", authenticate, expenseRoutes);

export default router;

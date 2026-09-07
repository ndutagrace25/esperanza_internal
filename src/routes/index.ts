import { Router } from "express";
import employeeRoutes from "./employeeRoutes.js";
import authRoutes from "./authRoutes.js";
import roleRoutes from "./roleRoutes.js";
import clientRoutes from "./clientRoutes.js";
import productCategoryRoutes from "./productCategoryRoutes.js";
import productRoutes from "./productRoutes.js";
import jobCardRoutes from "./jobCardRoutes.js";
import saleRoutes from "./saleRoutes.js";
import salesPersonRoutes from "./salesPersonRoutes.js";
import expenseRoutes from "./expenseRoutes.js";
import clientIntegrationRoutes from "./clientIntegrationRoutes.js";
import clientSubscriptionRoutes from "./clientSubscriptionRoutes.js";
import smsRoutes from "./smsRoutes.js";
import publicRoutes from "./publicRoutes.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Public routes (no authentication required)
router.use("/auth", authRoutes);
router.use("/", publicRoutes);

// Protected routes (authentication required)
router.use("/employees", authenticate, employeeRoutes);
router.use("/roles", authenticate, roleRoutes);
router.use("/clients", authenticate, clientRoutes);
router.use("/client-integrations", authenticate, clientIntegrationRoutes);
router.use("/client-subscriptions", authenticate, clientSubscriptionRoutes);
router.use("/sms", authenticate, smsRoutes);
router.use("/product-categories", authenticate, productCategoryRoutes);
router.use("/products", authenticate, productRoutes);
router.use("/job-cards", authenticate, jobCardRoutes);
router.use("/sales", authenticate, saleRoutes);
router.use("/sales-people", authenticate, salesPersonRoutes);
router.use("/expenses", authenticate, expenseRoutes);

export default router;

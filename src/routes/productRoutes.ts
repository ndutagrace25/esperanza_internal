import { Router } from "express";
import * as productController from "../controllers/productController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view products
router.get("/", productController.getAll);

// All authenticated users can view a specific product
router.get("/:id", productController.getById);

// Only DIRECTOR role can create products
router.post("/", authorize("DIRECTOR"), productController.create);

// Only DIRECTOR role can update products
router.patch("/:id", authorize("DIRECTOR"), productController.update);

// Only DIRECTOR role can delete/discontinue products
router.delete("/:id", authorize("DIRECTOR"), productController.deleteProduct);

export default router;


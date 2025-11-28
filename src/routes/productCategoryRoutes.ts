import { Router } from "express";
import * as productCategoryController from "../controllers/productCategoryController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view product categories
router.get("/", productCategoryController.getAll);

// All authenticated users can view a specific category
router.get("/:id", productCategoryController.getById);

// Only DIRECTOR role can create categories
router.post("/", authorize("DIRECTOR"), productCategoryController.create);

// Only DIRECTOR role can update categories
router.patch("/:id", authorize("DIRECTOR"), productCategoryController.update);

// Only DIRECTOR role can delete/archive categories
router.delete(
  "/:id",
  authorize("DIRECTOR"),
  productCategoryController.deleteProductCategory
);

export default router;


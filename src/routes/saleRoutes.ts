import { Router } from "express";
import * as saleController from "../controllers/saleController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view sales
router.get("/", authorize("DIRECTOR"), saleController.getAll);

// Get sale by sale number (before /:id route to avoid conflicts)
router.get(
  "/sale-number/:saleNumber",
  authorize("DIRECTOR"),
  saleController.getBySaleNumber
);

// All authenticated users can view a specific sale
router.get("/:id", authorize("DIRECTOR"), saleController.getById);

// Only DIRECTOR role can create sales
router.post("/", authorize("DIRECTOR"), saleController.create);

// Only DIRECTOR role can update sales
router.patch("/:id", authorize("DIRECTOR"), saleController.update);

// Only DIRECTOR role can delete/cancel sales
router.delete("/:id", authorize("DIRECTOR"), saleController.deleteSale);

// Sale Item operations
// Only DIRECTOR role can create sale items
router.post("/:saleId/items", authorize("DIRECTOR"), saleController.createItem);

// Only DIRECTOR role can update sale items
router.patch("/items/:id", authorize("DIRECTOR"), saleController.updateItem);

// Only DIRECTOR role can delete sale items
router.delete("/items/:id", authorize("DIRECTOR"), saleController.deleteItem);

export default router;

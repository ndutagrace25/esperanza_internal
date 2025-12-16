import { Router } from "express";
import * as expenseController from "../controllers/expenseController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// ==================== Expense Categories ====================
// All authenticated users can view expense categories
router.get("/categories", expenseController.getCategories);
router.get("/categories/:id", expenseController.getCategoryById);

// ==================== Expenses ====================
// All authenticated users can view expenses
router.get("/", expenseController.getAll);

// Get expense by expense number (before /:id route to avoid conflicts)
router.get(
  "/expense-number/:expenseNumber",
  expenseController.getByExpenseNumber
);

// Get expense by ID
router.get("/:id", expenseController.getById);

// All authenticated users can create expenses
router.post("/", expenseController.create);

// All authenticated users can update their own expenses
router.patch("/:id", expenseController.update);

// Only DIRECTOR role can approve expenses
router.post("/:id/approve", authorize("DIRECTOR"), expenseController.approve);

// Only DIRECTOR role can mark expenses as paid
router.post("/:id/pay", authorize("DIRECTOR"), expenseController.markAsPaid);

// Only DIRECTOR role can reject expenses
router.post("/:id/reject", authorize("DIRECTOR"), expenseController.reject);

// All authenticated users can cancel their own expenses
router.post("/:id/cancel", expenseController.cancel);

// Only DIRECTOR role can delete expenses
router.delete("/:id", authorize("DIRECTOR"), expenseController.deleteExpense);

export default router;


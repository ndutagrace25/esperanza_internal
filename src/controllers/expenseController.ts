import type { Request, Response } from "express";
import * as expenseService from "../services/expenseService.js";
import * as expenseCategoryService from "../services/expenseCategoryService.js";
import type { ExpenseStatus } from "@prisma/client";

// Helper to parse query params
function parseQueryParam(param: unknown): string | undefined {
  if (param === undefined) return undefined;
  if (Array.isArray(param)) return param[0] as string;
  if (typeof param === "string" && param.trim() !== "") return param;
  return undefined;
}

function parseIntParam(param: unknown): number | undefined {
  const str = parseQueryParam(param);
  if (!str) return undefined;
  const num = parseInt(str, 10);
  return isNaN(num) ? undefined : num;
}

function parseDateParam(param: unknown): Date | undefined {
  const str = parseQueryParam(param);
  if (!str) return undefined;
  const date = new Date(str);
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Get all expenses with pagination and filters
 * Note: Job card expenses are viewed via job cards, not filtered here
 */
export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const page = parseIntParam(req.query["page"]);
    const limit = parseIntParam(req.query["limit"]);
    const status = parseQueryParam(req.query["status"]) as ExpenseStatus | undefined;
    const categoryId = parseQueryParam(req.query["categoryId"]);
    const submittedById = parseQueryParam(req.query["submittedById"]);
    const startDate = parseDateParam(req.query["startDate"]);
    const endDate = parseDateParam(req.query["endDate"]);
    const search = parseQueryParam(req.query["search"]);

    // Validate pagination parameters
    if (page !== undefined && page < 1) {
      res.status(400).json({ error: "Page must be a positive number" });
      return;
    }

    if (limit !== undefined && (limit < 1 || limit > 100)) {
      res.status(400).json({
        error: "Limit must be a positive number between 1 and 100",
      });
      return;
    }

    const result = await expenseService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(submittedById && { submittedById }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(search && { search }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
}

/**
 * Get expense by ID
 */
export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await expenseService.findById(id);

    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    res.json(expense);
  } catch (error) {
    console.error("Error fetching expense:", error);
    res.status(500).json({ error: "Failed to fetch expense" });
  }
}

/**
 * Get expense by expense number
 */
export async function getByExpenseNumber(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { expenseNumber } = req.params;
    if (!expenseNumber) {
      res.status(400).json({ error: "Expense number is required" });
      return;
    }

    const expense = await expenseService.findByExpenseNumber(expenseNumber);

    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    res.json(expense);
  } catch (error) {
    console.error("Error fetching expense:", error);
    res.status(500).json({ error: "Failed to fetch expense" });
  }
}

/**
 * Create a new standalone expense (not linked to job card)
 * Job card expenses are automatically created via jobCardService
 */
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { 
      categoryId, 
      description, 
      amount, 
      expenseDate,
      vendor,
      referenceNumber,
      paymentMethod,
      hasReceipt,
      receiptUrl,
      notes,
    } = req.body;

    // Validate required fields
    if (!categoryId) {
      res.status(400).json({ error: "Category is required" });
      return;
    }
    if (!description) {
      res.status(400).json({ error: "Description is required" });
      return;
    }
    if (!amount) {
      res.status(400).json({ error: "Amount is required" });
      return;
    }
    if (!expenseDate) {
      res.status(400).json({ error: "Expense date is required" });
      return;
    }

    // Create standalone expense (no jobCardId or jobExpenseId)
    const expense = await expenseService.create(
      {
        categoryId,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        submittedById: req.employee?.id,
        vendor: vendor || null,
        referenceNumber: referenceNumber || null,
        paymentMethod: paymentMethod || null,
        hasReceipt: hasReceipt || false,
        receiptUrl: receiptUrl || null,
        notes: notes || null,
        status: "PENDING",
      },
      req.employee?.id
    );
    res.status(201).json(expense);
  } catch (error) {
    console.error("Error creating expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create expense";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Update an expense
 * Note: jobCardId and jobExpenseId cannot be modified (managed by jobCardService)
 */
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    // Extract only allowed fields (exclude jobCardId, jobExpenseId)
    const {
      categoryId,
      description,
      amount,
      expenseDate,
      vendor,
      referenceNumber,
      paymentMethod,
      status,
      hasReceipt,
      receiptUrl,
      notes,
    } = req.body;

    const updateData: expenseService.UpdateExpenseData = {};
    
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (description !== undefined) updateData.description = description;
    if (amount !== undefined) updateData.amount = amount;
    if (expenseDate !== undefined) updateData.expenseDate = new Date(expenseDate);
    if (vendor !== undefined) updateData.vendor = vendor;
    if (referenceNumber !== undefined) updateData.referenceNumber = referenceNumber;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (status !== undefined) updateData.status = status;
    if (hasReceipt !== undefined) updateData.hasReceipt = hasReceipt;
    if (receiptUrl !== undefined) updateData.receiptUrl = receiptUrl;
    if (notes !== undefined) updateData.notes = notes;

    const expense = await expenseService.update(id, updateData, req.employee?.id);
    res.json(expense);
  } catch (error) {
    console.error("Error updating expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update expense";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Approve an expense
 */
export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await expenseService.approve(
      id,
      req.employee?.id as string,
      req.employee?.id
    );
    res.json(expense);
  } catch (error) {
    console.error("Error approving expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to approve expense";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Mark expense as paid
 */
export async function markAsPaid(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await expenseService.markAsPaid(
      id,
      req.employee?.id as string,
      req.employee?.id
    );
    res.json(expense);
  } catch (error) {
    console.error("Error marking expense as paid:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to mark expense as paid";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Reject an expense
 */
export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      res.status(400).json({ error: "Rejection reason is required" });
      return;
    }

    const expense = await expenseService.reject(
      id,
      rejectionReason,
      req.employee?.id
    );
    res.json(expense);
  } catch (error) {
    console.error("Error rejecting expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to reject expense";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Cancel an expense
 */
export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await expenseService.cancel(id, req.employee?.id);
    res.json(expense);
  } catch (error) {
    console.error("Error cancelling expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to cancel expense";
    res.status(400).json({ error: errorMessage });
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    await expenseService.deleteExpense(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete expense";
    res.status(400).json({ error: errorMessage });
  }
}

// ==================== Expense Categories ====================

/**
 * Get all active expense categories
 */
export async function getCategories(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const categories = await expenseCategoryService.findAll();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching expense categories:", error);
    res.status(500).json({ error: "Failed to fetch expense categories" });
  }
}

/**
 * Get expense category by ID
 */
export async function getCategoryById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    const category = await expenseCategoryService.findById(id);

    if (!category) {
      res.status(404).json({ error: "Expense category not found" });
      return;
    }

    res.json(category);
  } catch (error) {
    console.error("Error fetching expense category:", error);
    res.status(500).json({ error: "Failed to fetch expense category" });
  }
}


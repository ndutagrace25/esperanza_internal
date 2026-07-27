import type { Request, Response } from "express";
import * as saleService from "../services/saleService.js";
import { getParam } from "../utils/params.js";

function parseQueryParam(param: unknown): string | undefined {
  if (param === undefined) return undefined;
  if (Array.isArray(param)) return param[0] as string;
  if (typeof param === "string" && param.trim() !== "") return param;
  return undefined;
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Get pagination parameters from query string
    const pageParam = req.query["page"];
    const limitParam = req.query["limit"];

    // Parse page
    let page: number | undefined;
    if (pageParam !== undefined) {
      if (Array.isArray(pageParam)) {
        page = parseInt(pageParam[0] as string, 10);
      } else if (typeof pageParam === "string" && pageParam.trim() !== "") {
        page = parseInt(pageParam, 10);
      }
    }

    // Parse limit
    let limit: number | undefined;
    if (limitParam !== undefined) {
      if (Array.isArray(limitParam)) {
        limit = parseInt(limitParam[0] as string, 10);
      } else if (typeof limitParam === "string" && limitParam.trim() !== "") {
        limit = parseInt(limitParam, 10);
      }
    }

    // Validate pagination parameters
    if (page !== undefined && (isNaN(page) || page < 1)) {
      res.status(400).json({ error: "Page must be a positive number" });
      return;
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
      res.status(400).json({
        error: "Limit must be a positive number between 1 and 100",
      });
      return;
    }

    const search = parseQueryParam(req.query["search"]);

    const result = await saleService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
      ...(search && { search }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
}

export async function getUnpaidTotals(_req: Request, res: Response): Promise<void> {
  try {
    const totals = await saleService.getUnpaidSalesTotals();
    res.json(totals);
  } catch (error) {
    console.error("Error fetching unpaid sales totals:", error);
    res.status(500).json({ error: "Failed to fetch unpaid sales totals" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const sale = await saleService.findById(id);

    if (!sale) {
      res.status(404).json({ error: "Sale not found" });
      return;
    }

    res.json(sale);
  } catch (error) {
    console.error("Error fetching sale:", error);
    res.status(500).json({ error: "Failed to fetch sale" });
  }
}

export async function getBySaleNumber(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleNumber = getParam(req.params["saleNumber"]);
    if (!saleNumber) {
      res.status(400).json({ error: "Sale number is required" });
      return;
    }

    const sale = await saleService.findBySaleNumber(saleNumber);

    if (!sale) {
      res.status(404).json({ error: "Sale not found" });
      return;
    }

    res.json(sale);
  } catch (error) {
    console.error("Error fetching sale:", error);
    res.status(500).json({ error: "Failed to fetch sale" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const sale = await saleService.create(req.body, req.employee?.id);
    res.status(201).json(sale);
  } catch (error) {
    console.error("Error creating sale:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create sale";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const sale = await saleService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(sale);
  } catch (error) {
    console.error("Error updating sale:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update sale";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteSale(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    await saleService.remove(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting sale:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete sale";
    res.status(400).json({ error: errorMessage });
  }
}

// Sale Item operations
export async function createItem(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleId = getParam(req.params["saleId"]);
    if (!saleId) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const item = await saleService.createItem(
      saleId,
      req.body,
      req.employee?.id
    );
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating sale item:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create sale item";
    res.status(400).json({ error: errorMessage });
  }
}

export async function updateItem(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sale item ID is required" });
      return;
    }

    const item = await saleService.updateItem(
      id,
      req.body,
      req.employee?.id
    );
    res.json(item);
  } catch (error) {
    console.error("Error updating sale item:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update sale item";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteItem(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sale item ID is required" });
      return;
    }

    await saleService.deleteItem(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting sale item:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to delete sale item";
    res.status(400).json({ error: errorMessage });
  }
}

// Sale Installment operations
export async function createInstallment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleId = getParam(req.params["saleId"]);
    if (!saleId) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const installment = await saleService.createInstallment(
      saleId,
      req.body,
      req.employee?.id
    );
    res.status(201).json(installment);
  } catch (error) {
    console.error("Error creating installment:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create installment";
    res.status(400).json({ error: errorMessage });
  }
}

export async function updateInstallment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Installment ID is required" });
      return;
    }

    const installment = await saleService.updateInstallment(
      id,
      req.body,
      req.employee?.id
    );
    res.json(installment);
  } catch (error) {
    console.error("Error updating installment:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update installment";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteInstallment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Installment ID is required" });
      return;
    }

    await saleService.deleteInstallment(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting installment:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to delete installment";
    res.status(400).json({ error: errorMessage });
  }
}

// Sale commission payments
export async function getCommissionPayments(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleId = getParam(req.params["saleId"]);
    if (!saleId) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const payments = await saleService.getCommissionPayments(saleId);
    res.json(payments);
  } catch (error) {
    console.error("Error fetching commission payments:", error);
    res.status(500).json({ error: "Failed to fetch commission payments" });
  }
}

export async function recordCommissionPayment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleId = getParam(req.params["saleId"]);
    if (!saleId) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const { amount, paymentMethod, referenceNumber, paymentDate, notes } =
      req.body;

    if (!amount) {
      res.status(400).json({ error: "Payment amount is required" });
      return;
    }

    const sale = await saleService.recordCommissionPayment(
      saleId,
      {
        amount,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        ...(paymentDate && { paymentDate: new Date(paymentDate) }),
      },
      req.employee?.id
    );
    res.status(201).json(sale);
  } catch (error) {
    console.error("Error recording commission payment:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to record commission payment";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteCommissionPayment(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const paymentId = getParam(req.params["paymentId"]);
    if (!paymentId) {
      res.status(400).json({ error: "Payment ID is required" });
      return;
    }

    const sale = await saleService.deleteCommissionPayment(
      paymentId,
      req.employee?.id
    );
    res.json(sale);
  } catch (error) {
    console.error("Error deleting commission payment:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to delete commission payment";
    res.status(400).json({ error: errorMessage });
  }
}

// Sale amount history
export async function getAmountHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const saleId = getParam(req.params["saleId"]);
    if (!saleId) {
      res.status(400).json({ error: "Sale ID is required" });
      return;
    }

    const history = await saleService.getSaleAmountHistory(saleId);
    res.json(history);
  } catch (error) {
    console.error("Error fetching sale amount history:", error);
    res.status(500).json({ error: "Failed to fetch sale amount history" });
  }
}

// Commission summary + per-salesperson drill-down
export async function getCommissionSummary(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const summary = await saleService.getCommissionSummary();
    res.json(summary);
  } catch (error) {
    console.error("Error fetching commission summary:", error);
    res.status(500).json({ error: "Failed to fetch commission summary" });
  }
}

export async function getSalesForSalesPerson(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const salesPersonId = getParam(req.params["salesPersonId"]);
    if (!salesPersonId) {
      res.status(400).json({ error: "Sales person ID is required" });
      return;
    }

    const sales = await saleService.getSalesForSalesPerson(salesPersonId);
    res.json(sales);
  } catch (error) {
    console.error("Error fetching sales for sales person:", error);
    res.status(500).json({ error: "Failed to fetch sales for sales person" });
  }
}


import type { Request, Response } from "express";
import * as saleService from "../services/saleService.js";

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

    const result = await saleService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({ error: "Failed to fetch sales" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
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
    const { saleNumber } = req.params;
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
    const { id } = req.params;
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
    const { id } = req.params;
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
    const { saleId } = req.params;
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
    const { id } = req.params;
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
    const { id } = req.params;
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


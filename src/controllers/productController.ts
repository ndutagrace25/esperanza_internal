import type { Request, Response } from "express";
import * as productService from "../services/productService.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Get pagination parameters from query string
    const page = req.query["page"]
      ? parseInt(req.query["page"] as string, 10)
      : undefined;
    const limit = req.query["limit"]
      ? parseInt(req.query["limit"] as string, 10)
      : undefined;

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

    const result = await productService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Product ID is required" });
      return;
    }

    const product = await productService.findById(id);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const product = await productService.create(req.body, req.employee?.id);
    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create product";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Product ID is required" });
      return;
    }

    const product = await productService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(product);
  } catch (error) {
    console.error("Error updating product:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update product";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteProduct(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Product ID is required" });
      return;
    }

    const product = await productService.deleteProduct(id, req.employee?.id);
    res.json(product);
  } catch (error) {
    console.error("Error discontinuing product:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to discontinue product";
    res.status(400).json({ error: errorMessage });
  }
}


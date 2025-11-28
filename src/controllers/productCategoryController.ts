import type { Request, Response } from "express";
import * as productCategoryService from "../services/productCategoryService.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const categories = await productCategoryService.findAll();
    res.json(categories);
  } catch (error) {
    console.error("Error fetching product categories:", error);
    res.status(500).json({ error: "Failed to fetch product categories" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    const category = await productCategoryService.findById(id);

    if (!category) {
      res.status(404).json({ error: "Product category not found" });
      return;
    }

    res.json(category);
  } catch (error) {
    console.error("Error fetching product category:", error);
    res.status(500).json({ error: "Failed to fetch product category" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const category = await productCategoryService.create(
      req.body,
      req.employee?.id
    );
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating product category:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create product category";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    const category = await productCategoryService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(category);
  } catch (error) {
    console.error("Error updating product category:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update product category";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteProductCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    const category = await productCategoryService.deleteProductCategory(
      id,
      req.employee?.id
    );
    res.json(category);
  } catch (error) {
    console.error("Error archiving product category:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to archive product category";
    res.status(400).json({ error: errorMessage });
  }
}


import type { Request, Response } from "express";
import * as salesPersonService from "../services/salesPersonService.js";
import { getParam } from "../utils/params.js";

function parseQueryParam(param: unknown): string | undefined {
  if (param === undefined) return undefined;
  if (Array.isArray(param)) return param[0] as string;
  if (typeof param === "string" && param.trim() !== "") return param;
  return undefined;
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query["page"]
      ? parseInt(req.query["page"] as string, 10)
      : undefined;
    const limit = req.query["limit"]
      ? parseInt(req.query["limit"] as string, 10)
      : undefined;
    const search = parseQueryParam(req.query["search"]);

    const result = await salesPersonService.findAll({
      ...(page !== undefined && !isNaN(page) && { page }),
      ...(limit !== undefined && !isNaN(limit) && { limit }),
      ...(search && { search }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching sales people:", error);
    res.status(500).json({ error: "Failed to fetch sales people" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sales person ID is required" });
      return;
    }

    const salesPerson = await salesPersonService.findById(id);
    if (!salesPerson) {
      res.status(404).json({ error: "Sales person not found" });
      return;
    }

    res.json(salesPerson);
  } catch (error) {
    console.error("Error fetching sales person:", error);
    res.status(500).json({ error: "Failed to fetch sales person" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const salesPerson = await salesPersonService.create(
      req.body,
      req.employee?.id
    );
    res.status(201).json(salesPerson);
  } catch (error) {
    console.error("Error creating sales person:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create sales person";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sales person ID is required" });
      return;
    }

    const salesPerson = await salesPersonService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(salesPerson);
  } catch (error) {
    console.error("Error updating sales person:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update sales person";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Sales person ID is required" });
      return;
    }

    const salesPerson = await salesPersonService.deactivate(
      id,
      req.employee?.id
    );
    res.json(salesPerson);
  } catch (error) {
    console.error("Error deactivating sales person:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to deactivate sales person";
    res.status(400).json({ error: errorMessage });
  }
}

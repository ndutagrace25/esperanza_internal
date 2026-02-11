import type { Request, Response } from "express";
import * as clientService from "../services/clientService.js";
import { getParam } from "../utils/params.js";

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

    const result = await clientService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Client ID is required" });
      return;
    }

    const client = await clientService.findById(id);

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ error: "Failed to fetch client" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const client = await clientService.create(req.body, req.employee?.id);
    res.status(201).json(client);
  } catch (error) {
    console.error("Error creating client:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create client";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Client ID is required" });
      return;
    }

    const client = await clientService.update(id, req.body, req.employee?.id);
    res.json(client);
  } catch (error) {
    console.error("Error updating client:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update client";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteClient(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Client ID is required" });
      return;
    }

    const client = await clientService.deleteClient(id, req.employee?.id);
    res.json(client);
  } catch (error) {
    console.error("Error archiving client:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to archive client";
    res.status(400).json({ error: errorMessage });
  }
}

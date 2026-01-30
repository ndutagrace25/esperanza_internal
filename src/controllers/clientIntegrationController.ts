import type { Request, Response } from "express";
import * as clientIntegrationService from "../services/clientIntegrationService.js";

export async function getByClientId(req: Request, res: Response): Promise<void> {
  try {
    const clientId = req.query["clientId"] as string | undefined;
    if (!clientId || clientId.trim() === "") {
      res.status(400).json({ error: "clientId query parameter is required" });
      return;
    }

    const integrations = await clientIntegrationService.findAllByClientId(
      clientId.trim()
    );
    res.json(integrations);
  } catch (error) {
    console.error("Error fetching client integrations:", error);
    res.status(500).json({ error: "Failed to fetch client integrations" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Integration ID is required" });
      return;
    }

    const integration = await clientIntegrationService.findById(id);

    if (!integration) {
      res.status(404).json({ error: "Client integration not found" });
      return;
    }

    res.json(integration);
  } catch (error) {
    console.error("Error fetching client integration:", error);
    res.status(500).json({ error: "Failed to fetch client integration" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const integration = await clientIntegrationService.create(
      req.body,
      req.employee?.id
    );
    res.status(201).json(integration);
  } catch (error) {
    console.error("Error creating client integration:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create client integration";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Integration ID is required" });
      return;
    }

    const integration = await clientIntegrationService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(integration);
  } catch (error) {
    console.error("Error updating client integration:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update client integration";
    res.status(400).json({ error: errorMessage });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Integration ID is required" });
      return;
    }

    await clientIntegrationService.remove(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting client integration:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to delete client integration";
    res.status(400).json({ error: errorMessage });
  }
}

import type { Request, Response } from "express";
import * as clientSubscriptionService from "../services/clientSubscriptionService.js";
import { getParam } from "../utils/params.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const clientId = req.query["clientId"] as string | undefined;
    const expiryFrom = req.query["expiryFrom"] as string | undefined;
    const expiryTo = req.query["expiryTo"] as string | undefined;

    const subscriptions = await clientSubscriptionService.findAll({
      ...(clientId?.trim() && { clientId: clientId.trim() }),
      ...(expiryFrom?.trim() && { expiryFrom: expiryFrom.trim() }),
      ...(expiryTo?.trim() && { expiryTo: expiryTo.trim() }),
    });
    res.json(subscriptions);
  } catch (error) {
    console.error("Error fetching client subscriptions:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to fetch client subscriptions";
    res.status(400).json({ error: errorMessage });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Subscription ID is required" });
      return;
    }

    const subscription = await clientSubscriptionService.findById(id);
    if (!subscription) {
      res.status(404).json({ error: "Client subscription not found" });
      return;
    }

    res.json(subscription);
  } catch (error) {
    console.error("Error fetching client subscription:", error);
    res.status(500).json({ error: "Failed to fetch client subscription" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const subscription = await clientSubscriptionService.create(
      req.body,
      req.employee?.id
    );
    res.status(201).json(subscription);
  } catch (error) {
    console.error("Error creating client subscription:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to create client subscription";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Subscription ID is required" });
      return;
    }

    const subscription = await clientSubscriptionService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(subscription);
  } catch (error) {
    console.error("Error updating client subscription:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to update client subscription";
    res.status(400).json({ error: errorMessage });
  }
}

export async function renew(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Subscription ID is required" });
      return;
    }

    const { licenseExpiryDate } = req.body as {
      licenseExpiryDate?: string;
    };
    if (!licenseExpiryDate || String(licenseExpiryDate).trim() === "") {
      res.status(400).json({ error: "licenseExpiryDate is required" });
      return;
    }

    const subscription = await clientSubscriptionService.renew(
      id,
      { licenseExpiryDate: String(licenseExpiryDate).trim() },
      req.employee?.id
    );
    res.json(subscription);
  } catch (error) {
    console.error("Error renewing client subscription:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to renew client subscription";
    res.status(400).json({ error: errorMessage });
  }
}

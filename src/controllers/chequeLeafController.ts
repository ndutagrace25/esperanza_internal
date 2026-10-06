import type { Request, Response } from "express";
import type { ChequeLeafStatus } from "@prisma/client";
import * as chequeLeafService from "../services/chequeLeafService.js";
import { getParam } from "../utils/params.js";

function parseQueryParam(param: unknown): string | undefined {
  if (param === undefined) return undefined;
  if (Array.isArray(param)) return param[0] as string;
  if (typeof param === "string" && param.trim() !== "") return param;
  return undefined;
}

const STATUSES: ChequeLeafStatus[] = ["ISSUED", "CANCELLED"];

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query["page"]
      ? parseInt(req.query["page"] as string, 10)
      : undefined;
    const limit = req.query["limit"]
      ? parseInt(req.query["limit"] as string, 10)
      : undefined;
    const search = parseQueryParam(req.query["search"]);
    const statusRaw = parseQueryParam(req.query["status"]);
    const status = STATUSES.find((s) => s === statusRaw);

    const result = await chequeLeafService.findAll({
      ...(page !== undefined && !isNaN(page) && { page }),
      ...(limit !== undefined && !isNaN(limit) && { limit }),
      ...(search && { search }),
      ...(status && { status }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching cheque leaves:", error);
    res.status(500).json({ error: "Failed to fetch cheque leaves" });
  }
}

export async function getNextNumber(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const nextNumber = await chequeLeafService.findNextChequeNumber();
    res.json({ nextNumber });
  } catch (error) {
    console.error("Error fetching next cheque number:", error);
    res.status(500).json({ error: "Failed to fetch next cheque number" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Cheque leaf ID is required" });
      return;
    }

    const chequeLeaf = await chequeLeafService.findById(id);
    if (!chequeLeaf) {
      res.status(404).json({ error: "Cheque leaf not found" });
      return;
    }

    res.json(chequeLeaf);
  } catch (error) {
    console.error("Error fetching cheque leaf:", error);
    res.status(500).json({ error: "Failed to fetch cheque leaf" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const chequeLeaf = await chequeLeafService.create(
      req.body,
      req.employee?.id
    );
    res.status(201).json(chequeLeaf);
  } catch (error) {
    console.error("Error creating cheque leaf:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create cheque leaf";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Cheque leaf ID is required" });
      return;
    }

    const chequeLeaf = await chequeLeafService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(chequeLeaf);
  } catch (error) {
    console.error("Error updating cheque leaf:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update cheque leaf";
    res.status(400).json({ error: errorMessage });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Cheque leaf ID is required" });
      return;
    }

    const chequeLeaf = await chequeLeafService.cancel(
      id,
      req.body?.reason,
      req.employee?.id
    );
    res.json(chequeLeaf);
  } catch (error) {
    console.error("Error cancelling cheque leaf:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to cancel cheque leaf";
    res.status(400).json({ error: errorMessage });
  }
}

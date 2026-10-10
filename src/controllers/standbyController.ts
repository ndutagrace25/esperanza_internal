import type { Request, Response } from "express";
import * as standbyService from "../services/standbyService.js";
import { getParam } from "../utils/params.js";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * GET /standby
 * Rotation order plus recent and upcoming standby weekends (any employee).
 */
export async function getRota(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await standbyService.getRota());
  } catch (error) {
    console.error("Error fetching standby rota:", error);
    res.status(500).json({ error: "Failed to fetch standby rota" });
  }
}

/**
 * PUT /standby/rotation
 * Body: { employeeIds: string[] } in rotation order (directors only).
 */
export async function setRotation(req: Request, res: Response): Promise<void> {
  try {
    const { employeeIds } = req.body ?? {};
    if (
      !Array.isArray(employeeIds) ||
      !employeeIds.every((id) => typeof id === "string")
    ) {
      res.status(400).json({ error: "employeeIds must be an array of IDs" });
      return;
    }
    res.json(await standbyService.setRotation(employeeIds, req.employee?.id));
  } catch (error) {
    console.error("Error updating standby rotation:", error);
    res
      .status(400)
      .json({ error: errorMessage(error, "Failed to update rotation") });
  }
}

/**
 * PATCH /standby/weekends/:id
 * Body: { employeeId: string; reason?: string } (directors only).
 */
export async function changeWeekend(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    const { employeeId, reason } = req.body ?? {};
    if (!employeeId || typeof employeeId !== "string") {
      res.status(400).json({ error: "employeeId is required" });
      return;
    }
    res.json(
      await standbyService.changeWeekend(
        id,
        employeeId,
        typeof reason === "string" ? reason : undefined,
        req.employee?.id
      )
    );
  } catch (error) {
    console.error("Error changing standby weekend:", error);
    res
      .status(400)
      .json({ error: errorMessage(error, "Failed to change standby") });
  }
}

/**
 * POST /standby/weekends/:id/swap
 * Body: { otherWeekendId: string; reason?: string } (directors only).
 */
export async function swapWeekends(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    const { otherWeekendId, reason } = req.body ?? {};
    if (!otherWeekendId || typeof otherWeekendId !== "string") {
      res.status(400).json({ error: "otherWeekendId is required" });
      return;
    }
    res.json(
      await standbyService.swapWeekends(
        id,
        otherWeekendId,
        typeof reason === "string" ? reason : undefined,
        req.employee?.id
      )
    );
  } catch (error) {
    console.error("Error swapping standby weekends:", error);
    res
      .status(400)
      .json({ error: errorMessage(error, "Failed to swap standby weekends") });
  }
}

/**
 * POST /standby/send-reminder
 * Send this weekend's standby SMS now, even if already sent (directors only).
 */
export async function sendReminder(req: Request, res: Response): Promise<void> {
  try {
    res.json(
      await standbyService.sendWeekendReminder({
        force: true,
        ...(req.employee?.id && { performedBy: req.employee.id }),
      })
    );
  } catch (error) {
    console.error("Error sending standby reminder:", error);
    res
      .status(500)
      .json({ error: errorMessage(error, "Failed to send standby reminder") });
  }
}

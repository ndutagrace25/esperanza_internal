import type { Request, Response } from "express";
import * as licenseService from "../services/licenseService.js";
import { LicenseError } from "../services/licenseService.js";
import { getParam } from "../utils/params.js";

const sendError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof LicenseError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
};

/**
 * Public - POST /api/licence/check-in
 * Body: { code, installationId, appVersion?, activationKey? }
 * Called by each Ventura backend; returns its current signed licence.
 */
export async function checkIn(req: Request, res: Response): Promise<void> {
  try {
    const { code, installationId, appVersion, activationKey, currentExpiry } = req.body ?? {};
    const forwarded = (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim();
    const result = await licenseService.checkIn({
      code: String(code ?? ""),
      installationId: String(installationId ?? ""),
      appVersion: appVersion ? String(appVersion) : undefined,
      activationKey: activationKey ? String(activationKey) : undefined,
      currentExpiry: currentExpiry ? String(currentExpiry) : undefined,
      ip: forwarded || req.socket.remoteAddress || undefined,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to check in licence");
  }
}

/** POST /api/client-subscriptions/:id/licence/offline { installationId } */
export async function issueOffline(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    const result = await licenseService.issueOfflineLicense(
      id,
      String(req.body?.installationId ?? "")
    );
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to issue offline licence");
  }
}

/** POST /api/client-subscriptions/:id/licence/activation-key */
export async function createActivationKey(req: Request, res: Response): Promise<void> {
  try {
    const result = await licenseService.createActivationKey(getParam(req.params["id"]));
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to create activation key");
  }
}

/** POST /api/client-subscriptions/:id/licence/reset-installation */
export async function resetInstallation(req: Request, res: Response): Promise<void> {
  try {
    await licenseService.resetInstallation(getParam(req.params["id"]));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Failed to reset installation");
  }
}

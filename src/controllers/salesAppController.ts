import type { Request, Response } from "express";
import * as auth from "../services/salesAppAuthService.js";
import { SalesAppAuthError } from "../services/salesAppAuthService.js";
import * as clients from "../services/salesAppClientService.js";
import { SalesAppClientError } from "../services/salesAppClientService.js";
import { getParam } from "../utils/params.js";

const handle =
  (fn: (req: Request) => Promise<unknown>, fallback: string) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error instanceof SalesAppAuthError || error instanceof SalesAppClientError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error(`[Sales app] ${fallback}:`, error);
      res.status(500).json({ error: fallback });
    }
  };

// ---- auth (public) ----
export const start = handle((req) => auth.start(req.body?.email), "Couldn't start sign-in");
export const requestTempPin = handle(
  (req) => auth.requestTempPin(req.body?.email),
  "Couldn't send a code"
);
export const verifyTempPin = handle(
  (req) => auth.verifyTempPin(req.body?.email, req.body?.tempPin),
  "Couldn't check the code"
);
export const setPin = handle(
  (req) => auth.setPin(req.body?.setupToken, req.body?.pin),
  "Couldn't set the PIN"
);
export const login = handle((req) => auth.login(req.body?.email, req.body?.pin), "Couldn't sign in");

// ---- signed in (sales person) ----
export const me = handle(async (req) => ({ salesPerson: req.salesPerson }), "Couldn't load profile");
export const listClients = handle(
  (req) =>
    clients.listClients(
      req.salesPerson!.id,
      typeof req.query["search"] === "string" ? req.query["search"] : undefined
    ),
  "Couldn't load clients"
);
export const updateExpiry = handle(
  (req) => clients.updateExpiry(req.salesPerson!.id, getParam(req.params["id"]), req.body?.expiryDate),
  "Couldn't update the expiry date"
);

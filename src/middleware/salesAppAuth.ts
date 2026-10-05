import type { Request, Response, NextFunction } from "express";
import { getProfile, verifySalesAppToken } from "../services/salesAppAuthService.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      salesPerson?: { id: string; name: string; email: string | null; phone: string | null };
    }
  }
}

/**
 * Sales app routes only: requires a sales person token (not an employee
 * token), and that the sales person is still active.
 */
export async function authenticateSalesPerson(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const salesPersonId = token ? verifySalesAppToken(token) : null;
  if (!salesPersonId) {
    res.status(401).json({ error: "Please sign in again" });
    return;
  }
  const profile = await getProfile(salesPersonId);
  if (!profile) {
    res.status(401).json({ error: "Your account is not active" });
    return;
  }
  req.salesPerson = profile;
  next();
}

import type { Request, Response } from "express";
import {
  login,
  requestPasswordReset,
  resetPassword,
} from "../services/authService.js";

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    // Check if req.body exists
    if (!req.body) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }

    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: "Email and password are required",
      });
      return;
    }

    const result = await login({ email, password });

    if (!result.success) {
      res.status(401).json({
        error: result.error,
        requiresPasswordReset: result.requiresPasswordReset ?? false,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
}

export async function requestPasswordResetHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.body) {
      res.status(400).json({
        error: "Email is required",
      });
      return;
    }

    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        error: "Email is required",
      });
      return;
    }

    const result = await requestPasswordReset(email);

    if (!result.success) {
      res.status(400).json({
        error: result.error,
      });
      return;
    }

    res.json({
      message: result.message,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.body) {
      res.status(400).json({
        error: "Email, temporary password, and new password are required",
      });
      return;
    }

    const { email, tempPassword, newPassword } = req.body;

    if (!email || !tempPassword || !newPassword) {
      res.status(400).json({
        error: "Email, temporary password, and new password are required",
      });
      return;
    }

    const result = await resetPassword({ email, tempPassword, newPassword });

    if (!result.success) {
      const statusCode = result.requiresNewTempPassword ? 400 : 401;
      res.status(statusCode).json({
        error: result.error,
        requiresNewTempPassword: result.requiresNewTempPassword ?? false,
      });
      return;
    }

    res.json(result.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
}

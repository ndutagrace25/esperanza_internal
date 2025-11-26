import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/authService.js";
import { findById } from "../services/employeeService.js";

// Extend Express Request type to include employee
declare global {
  namespace Express {
    interface Request {
      employee?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches employee info to request
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized.",
      });
      return;
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({
        error: "Invalid or expired token. Please login again.",
      });
      return;
    }

    // Verify employee still exists
    const employee = await findById(decoded.employeeId);
    if (!employee) {
      res.status(401).json({
        error: "Employee not found. Please login again.",
      });
      return;
    }

    // Attach employee info to request
    req.employee = {
      id: employee.id,
      email: employee.email,
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: "Authentication failed. Please login again.",
    });
  }
}

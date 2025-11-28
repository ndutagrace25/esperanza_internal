import type { Request } from "express";
import { findById } from "../services/employeeService.js";

/**
 * Checks if the current user can modify (update/delete) a target employee
 *
 * Rules:
 * - Directors can update/delete staff members
 * - Directors can update their own details (even if they're a director)
 * - Directors CANNOT update/delete other directors (regardless of what fields are being changed)
 * - Directors can modify employees without roles
 *
 * Note: This check is based on the target employee's CURRENT role, not their role after the update.
 * This prevents directors from modifying other directors even if they're trying to change their role.
 *
 * @param req - Express request object (must have authenticated employee)
 * @param targetEmployeeId - ID of the employee being modified
 * @returns Promise resolving to true if allowed, false otherwise
 */
export async function canModifyEmployee(
  req: Request,
  targetEmployeeId: string
): Promise<boolean> {
  // Must be authenticated
  if (!req.employee?.id) {
    return false;
  }

  const currentUserId = req.employee.id;
  const currentUserRole = req.employee.roleName;

  // If user is not a director, they can't modify employees (this should be caught by authorize middleware, but double-check)
  if (currentUserRole !== "DIRECTOR") {
    return false;
  }

  // Directors can always modify themselves
  if (currentUserId === targetEmployeeId) {
    return true;
  }

  // Fetch the target employee to check their role
  const targetEmployee = await findById(targetEmployeeId);
  if (!targetEmployee) {
    return false;
  }

  // Directors cannot modify other directors
  if (targetEmployee.role?.name === "DIRECTOR") {
    return false;
  }

  // Directors can modify staff members
  return true;
}

/**
 * Validates if the current user can modify an employee and throws an error if not
 * Use this in controllers to enforce the permission check
 *
 * @param req - Express request object
 * @param targetEmployeeId - ID of the employee being modified
 * @throws Error if the user cannot modify the employee
 */
export async function validateCanModifyEmployee(
  req: Request,
  targetEmployeeId: string
): Promise<void> {
  const canModify = await canModifyEmployee(req, targetEmployeeId);
  if (!canModify) {
    throw new Error(
      "Forbidden. Directors cannot modify other directors. You can only modify staff members or your own details."
    );
  }
}

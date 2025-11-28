import type { Request, Response, NextFunction } from "express";

/**
 * Role-based authorization middleware
 * Restricts access to routes based on employee roles
 *
 * @param allowedRoles - Single role name or array of role names that are allowed to access the route
 * @returns Express middleware function
 *
 * @example
 * // Single role
 * router.post("/employees", authenticate, authorize("DIRECTOR"), createEmployee);
 *
 * @example
 * // Multiple roles
 * router.delete("/employees/:id", authenticate, authorize(["DIRECTOR", "MANAGER"]), deleteEmployee);
 */
export function authorize(
  allowedRoles: string | string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.employee) {
      res.status(401).json({
        error: "Unauthorized. Authentication required.",
      });
      return;
    }

    // Normalize allowedRoles to an array
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    // Check if employee has a role
    if (!req.employee.roleName) {
      res.status(403).json({
        error:
          "Forbidden. You do not have the required permissions to access this resource.",
      });
      return;
    }

    // Check if employee's role is in the allowed roles list
    if (!roles.includes(req.employee.roleName)) {
      res.status(403).json({
        error:
          "Forbidden. You do not have the required permissions to access this resource.",
      });
      return;
    }

    // User has required role, proceed
    next();
  };
}

/**
 * Convenience function to check if current user has a specific role
 * Can be used in controllers for additional role checks
 *
 * @param req - Express request object
 * @param roleName - Role name to check
 * @returns boolean indicating if user has the role
 */
export function hasRole(req: Request, roleName: string): boolean {
  return req.employee?.roleName === roleName;
}

/**
 * Convenience function to check if current user has any of the specified roles
 * Can be used in controllers for additional role checks
 *
 * @param req - Express request object
 * @param roleNames - Array of role names to check
 * @returns boolean indicating if user has any of the roles
 */
export function hasAnyRole(req: Request, roleNames: string[]): boolean {
  if (!req.employee?.roleName) {
    return false;
  }
  return roleNames.includes(req.employee.roleName);
}

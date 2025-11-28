# Authorization Middleware

This directory contains middleware for authentication and authorization.

## Authentication (`auth.ts`)

The `authenticate` middleware verifies JWT tokens and attaches employee information to the request object, including the employee's role.

**Usage:**
```typescript
import { authenticate } from "../middleware/auth.js";

router.use("/protected-route", authenticate, handler);
```

## Authorization (`authorize.ts`)

The `authorize` middleware restricts access to routes based on employee roles. It must be used **after** the `authenticate` middleware.

### Basic Usage

**Single Role:**
```typescript
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

// Only DIRECTOR can access this route
router.post("/employees", authenticate, authorize("DIRECTOR"), createEmployee);
```

**Multiple Roles:**
```typescript
// Both DIRECTOR and MANAGER can access this route
router.delete("/employees/:id", authenticate, authorize(["DIRECTOR", "MANAGER"]), deleteEmployee);
```

### Helper Functions

You can also use helper functions in your controllers for additional role checks:

```typescript
import { hasRole, hasAnyRole } from "../middleware/authorize.js";

export async function someHandler(req: Request, res: Response): Promise<void> {
  // Check if user has a specific role
  if (hasRole(req, "DIRECTOR")) {
    // Do something only directors can do
  }

  // Check if user has any of the specified roles
  if (hasAnyRole(req, ["DIRECTOR", "MANAGER"])) {
    // Do something directors or managers can do
  }
}
```

### Error Responses

- **401 Unauthorized**: Returned when user is not authenticated
- **403 Forbidden**: Returned when user is authenticated but doesn't have the required role

### Example Route Configuration

```typescript
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import * as controller from "../controllers/exampleController.js";

const router = Router();

// Public route (no authentication)
router.get("/public", controller.publicHandler);

// Authenticated route (any authenticated user)
router.get("/protected", authenticate, controller.protectedHandler);

// Role-restricted route (only DIRECTOR)
router.post("/admin-only", authenticate, authorize("DIRECTOR"), controller.adminHandler);

// Multiple roles allowed
router.delete("/manager-action", authenticate, authorize(["DIRECTOR", "MANAGER"]), controller.managerHandler);

export default router;
```

## Request Object

After authentication, the request object includes:

```typescript
req.employee = {
  id: string;           // Employee ID
  email: string;        // Employee email
  roleName: string | null; // Employee role name (e.g., "DIRECTOR", "STAFF")
}
```

## Notes

- Always use `authenticate` before `authorize`
- Role names are case-sensitive (e.g., "DIRECTOR" not "director")
- If an employee has no role (`roleName` is `null`), they will be denied access to role-restricted routes
- The authorization middleware checks roles synchronously, so it's fast and doesn't require database queries


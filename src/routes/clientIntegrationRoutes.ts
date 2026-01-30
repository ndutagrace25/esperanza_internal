import { Router } from "express";
import * as clientIntegrationController from "../controllers/clientIntegrationController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// List integrations for a client (query: ?clientId=xxx)
router.get(
  "/",
  authorize("DIRECTOR"),
  clientIntegrationController.getByClientId
);

// Get single integration by id
router.get(
  "/:id",
  authorize("DIRECTOR"),
  clientIntegrationController.getById
);

// Create integration
router.post(
  "/",
  authorize("DIRECTOR"),
  clientIntegrationController.create
);

// Update integration
router.patch(
  "/:id",
  authorize("DIRECTOR"),
  clientIntegrationController.update
);

// Delete integration
router.delete(
  "/:id",
  authorize("DIRECTOR"),
  clientIntegrationController.remove
);

export default router;

import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view clients
router.get("/", clientController.getAll);

// All authenticated users can view a specific client
router.get("/:id", clientController.getById);

// Only DIRECTOR role can create clients
router.post("/", authorize("DIRECTOR"), clientController.create);

// Only DIRECTOR role can update clients
router.patch("/:id", authorize("DIRECTOR"), clientController.update);

// Only DIRECTOR role can delete/archive clients
router.delete("/:id", authorize("DIRECTOR"), clientController.deleteClient);

export default router;

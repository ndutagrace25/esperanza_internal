import { Router } from "express";
import * as employeeController from "../controllers/employeeController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view employees
router.get("/", employeeController.getAll);

// All authenticated users can view a specific employee
router.get("/:id", employeeController.getById);

// Only DIRECTOR role can create employees
router.post("/", authorize("DIRECTOR"), employeeController.create);

// Only DIRECTOR role can update employees
router.patch("/:id", authorize("DIRECTOR"), employeeController.update);

// Only DIRECTOR role can delete/terminate employees
router.delete("/:id", authorize("DIRECTOR"), employeeController.deleteEmployee);

export default router;

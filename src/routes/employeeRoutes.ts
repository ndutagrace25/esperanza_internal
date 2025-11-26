import { Router } from "express";
import * as employeeController from "../controllers/employeeController.js";

const router = Router();

router.get("/", employeeController.getAll);
router.get("/:id", employeeController.getById);
router.post("/", employeeController.create);
router.put("/:id", employeeController.update);
router.delete("/:id", employeeController.deleteEmployee);

export default router;


import { Router } from "express";
import * as chequeLeafController from "../controllers/chequeLeafController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// Cheque leaf register is director-only
router.get("/", authorize("DIRECTOR"), chequeLeafController.getAll);
router.get(
  "/next-number",
  authorize("DIRECTOR"),
  chequeLeafController.getNextNumber
);
router.get("/:id", authorize("DIRECTOR"), chequeLeafController.getById);
router.post("/", authorize("DIRECTOR"), chequeLeafController.create);
router.patch("/:id", authorize("DIRECTOR"), chequeLeafController.update);
router.post("/:id/cancel", authorize("DIRECTOR"), chequeLeafController.cancel);

export default router;

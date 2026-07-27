import { Router } from "express";
import * as salesPersonController from "../controllers/salesPersonController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// Sales people are director-only, same as the rest of the Sales module
router.get("/", authorize("DIRECTOR"), salesPersonController.getAll);
router.get("/:id", authorize("DIRECTOR"), salesPersonController.getById);
router.post("/", authorize("DIRECTOR"), salesPersonController.create);
router.patch("/:id", authorize("DIRECTOR"), salesPersonController.update);
router.post(
  "/:id/deactivate",
  authorize("DIRECTOR"),
  salesPersonController.deactivate
);

export default router;

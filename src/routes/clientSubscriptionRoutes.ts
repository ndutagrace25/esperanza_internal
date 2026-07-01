import { Router } from "express";
import * as clientSubscriptionController from "../controllers/clientSubscriptionController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.get("/", authorize("DIRECTOR"), clientSubscriptionController.getAll);
router.get("/:id", authorize("DIRECTOR"), clientSubscriptionController.getById);
router.post("/", authorize("DIRECTOR"), clientSubscriptionController.create);
router.patch("/:id", authorize("DIRECTOR"), clientSubscriptionController.update);
router.post(
  "/:id/renew",
  authorize("DIRECTOR"),
  clientSubscriptionController.renew
);

export default router;

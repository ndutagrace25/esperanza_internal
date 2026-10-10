import { Router } from "express";
import * as standbyController from "../controllers/standbyController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// Anyone signed in can see the rota; only directors can change it
router.get("/", standbyController.getRota);
router.put("/rotation", authorize("DIRECTOR"), standbyController.setRotation);
router.patch(
  "/weekends/:id",
  authorize("DIRECTOR"),
  standbyController.changeWeekend
);
router.post(
  "/weekends/:id/swap",
  authorize("DIRECTOR"),
  standbyController.swapWeekends
);
router.post(
  "/send-reminder",
  authorize("DIRECTOR"),
  standbyController.sendReminder
);

export default router;

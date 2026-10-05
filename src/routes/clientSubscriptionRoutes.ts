import { Router } from "express";
import * as clientSubscriptionController from "../controllers/clientSubscriptionController.js";
import { authorize } from "../middleware/authorize.js";
import * as licenseController from "../controllers/licenseController.js";

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

// Ventura licensing (support actions)
router.post("/:id/licence/offline", authorize("DIRECTOR"), licenseController.issueOffline);
router.post(
  "/:id/licence/activation-key",
  authorize("DIRECTOR"),
  licenseController.createActivationKey
);
router.post(
  "/:id/licence/reset-installation",
  authorize("DIRECTOR"),
  licenseController.resetInstallation
);

export default router;

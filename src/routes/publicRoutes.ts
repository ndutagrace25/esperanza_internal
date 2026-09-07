import { Router } from "express";
import * as clientSubscriptionController from "../controllers/clientSubscriptionController.js";

const router = Router();

// GET /api/client/:code -> { apiBaseUrl } — no authentication required.
router.get("/client/:code", clientSubscriptionController.getApiBaseUrlByCode);

export default router;

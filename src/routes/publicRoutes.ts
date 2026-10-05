import { Router } from "express";
import * as clientSubscriptionController from "../controllers/clientSubscriptionController.js";
import * as licenseController from "../controllers/licenseController.js";

const router = Router();

// GET /api/client/:code -> { apiBaseUrl, mpesaBaseUrl, clientName } — no authentication required.
router.get("/client/:code", clientSubscriptionController.getApiBaseUrlByCode);

// POST /api/licence/check-in -> { license } — called by each Ventura backend, no authentication.
router.post("/licence/check-in", licenseController.checkIn);

export default router;

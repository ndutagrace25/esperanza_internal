import { Router } from "express";
import * as salesApp from "../controllers/salesAppController.js";
import { authenticateSalesPerson } from "../middleware/salesAppAuth.js";

// /api/sales-app - the mobile app for sales people (own login, see
// services/salesAppAuthService.ts). Employee tokens don't work here.
const router = Router();

// Sign-in: email -> (PIN) or (temporary PIN by email/SMS -> set PIN)
router.post("/auth/start", salesApp.start);
router.post("/auth/request-temp-pin", salesApp.requestTempPin);
router.post("/auth/verify-temp-pin", salesApp.verifyTempPin);
router.post("/auth/set-pin", salesApp.setPin);
router.post("/auth/login", salesApp.login);

// Signed in
router.get("/me", authenticateSalesPerson, salesApp.me);
router.get("/clients", authenticateSalesPerson, salesApp.listClients);
router.patch("/subscriptions/:id/expiry", authenticateSalesPerson, salesApp.updateExpiry);

export default router;

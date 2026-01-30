import { Router } from "express";
import * as smsController from "../controllers/smsController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// Send single SMS
router.post("/send", authorize("DIRECTOR"), smsController.sendSingle);

// Send bulk SMS
router.post("/send-bulk", authorize("DIRECTOR"), smsController.sendBulk);

// Get SMS account balance
router.get("/balance", authorize("DIRECTOR"), smsController.getBalance);

// Test payment reminder cron (triggers same logic as scheduled job)
router.post(
  "/test-payment-reminders",
  authorize("DIRECTOR"),
  smsController.testPaymentReminders
);

export default router;

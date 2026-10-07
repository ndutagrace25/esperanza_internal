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

// Recipients (clients + employees) for the bulk SMS page
router.get("/recipients", authorize("DIRECTOR"), smsController.getRecipients);

// Send one message to selected clients/employees (e.g. holiday greetings)
router.post("/broadcast", authorize("DIRECTOR"), smsController.broadcast);

// Test low SMS credit alert cron (triggers same logic as scheduled job)
router.post(
  "/test-balance-alert",
  authorize("DIRECTOR"),
  smsController.testBalanceAlert
);

// Test payment reminder cron (triggers same logic as scheduled job)
router.post(
  "/test-payment-reminders",
  authorize("DIRECTOR"),
  smsController.testPaymentReminders
);

export default router;

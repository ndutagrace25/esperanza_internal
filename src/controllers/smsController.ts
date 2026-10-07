import type { Request, Response } from "express";
import * as smsService from "../services/smsService.js";
import * as bulkSmsService from "../services/bulkSmsService.js";
import { sendPaymentReminders } from "../services/paymentReminderService.js";
import { checkSmsBalanceAndNotify } from "../services/smsBalanceService.js";

/**
 * POST /sms/send
 * Body: { message: string; mobile: string; shortcode?: string }
 */
export async function sendSingle(req: Request, res: Response): Promise<void> {
  try {
    const { message, mobile, shortcode } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }
    if (!mobile || typeof mobile !== "string" || mobile.trim() === "") {
      res.status(400).json({ error: "mobile is required" });
      return;
    }

    const result = await smsService.sendSingleSms({
      message: message.trim(),
      mobile: mobile.trim(),
      ...(shortcode && { shortcode: String(shortcode).trim() }),
    });

    res.json(result);
  } catch (error) {
    console.error("Error sending single SMS:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send SMS";
    res.status(500).json({ error: message });
  }
}

/**
 * POST /sms/send-bulk
 * Body: { smslist: Array<{ mobile: string; message: string; clientsmsid?: number }> }
 */
export async function sendBulk(req: Request, res: Response): Promise<void> {
  try {
    const { smslist } = req.body;

    if (!Array.isArray(smslist) || smslist.length === 0) {
      res.status(400).json({
        error: "smslist is required and must be a non-empty array",
      });
      return;
    }

    for (let i = 0; i < smslist.length; i++) {
      const item = smslist[i];
      if (!item || typeof item.mobile !== "string" || !item.mobile.trim()) {
        res.status(400).json({
          error: `smslist[${i}].mobile is required`,
        });
        return;
      }
      if (!item.message || typeof item.message !== "string") {
        res.status(400).json({
          error: `smslist[${i}].message is required`,
        });
        return;
      }
    }

    const result = await smsService.sendBulkSms({
      smslist: smslist.map(
        (item: { mobile: string; message: string; clientsmsid?: number }) => ({
          mobile: item.mobile.trim(),
          message: String(item.message).trim(),
          ...(item.clientsmsid != null && { clientsmsid: Number(item.clientsmsid) }),
        })
      ),
    });

    res.json(result);
  } catch (error) {
    console.error("Error sending bulk SMS:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send bulk SMS";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /sms/balance
 * Returns account balance from SMS provider.
 */
export async function getBalance(_req: Request, res: Response): Promise<void> {
  try {
    const result = await smsService.getBalance();
    res.json(result);
  } catch (error) {
    console.error("Error fetching SMS balance:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch SMS balance";
    res.status(500).json({ error: message });
  }
}

/**
 * POST /sms/test-balance-alert
 * Run the daily low SMS credit check now (same as cron).
 * Query: threshold (optional) to override the alert level, e.g. 5000 to force an alert.
 */
export async function testBalanceAlert(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const thresholdParam = req.query["threshold"] as string | undefined;
    const threshold =
      thresholdParam !== undefined ? Number(thresholdParam) : undefined;
    if (threshold !== undefined && (isNaN(threshold) || threshold < 0)) {
      res.status(400).json({ error: "threshold must be a non-negative number" });
      return;
    }

    const result = await checkSmsBalanceAndNotify(threshold);
    res.json(result);
  } catch (error) {
    console.error("Error running SMS balance check:", error);
    const message =
      error instanceof Error ? error.message : "Failed to check SMS balance";
    res.status(500).json({ error: message });
  }
}

/**
 * POST /sms/test-payment-reminders
 * Manually trigger the payment reminder logic (same as cron). For testing.
 * Query: date (optional) ISO date string e.g. 2026-02-01 to run "as if" that date.
 * Returns: { sent, skipped, errors }
 */
export async function testPaymentReminders(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const dateParam = req.query["date"] as string | undefined;
    const now = dateParam ? new Date(dateParam) : new Date();
    if (isNaN(now.getTime())) {
      res.status(400).json({ error: "Invalid date query (use ISO date e.g. 2026-02-01)" });
      return;
    }

    const result = await sendPaymentReminders(now);
    res.json(result);
  } catch (error) {
    console.error("Error running payment reminders:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run payment reminders";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /sms/recipients
 * Returns all non-archived clients and active employees for the bulk SMS page.
 */
export async function getRecipients(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await bulkSmsService.getRecipients();
    res.json(result);
  } catch (error) {
    console.error("Error fetching SMS recipients:", error);
    res.status(500).json({ error: "Failed to fetch SMS recipients" });
  }
}

/**
 * POST /sms/broadcast
 * Body: { message: string; clientIds?: string[]; employeeIds?: string[];
 *         otherRecipients?: Array<{ name: string; phone: string }> }
 * Message may contain {name}, replaced with each recipient's name.
 */
export async function broadcast(req: Request, res: Response): Promise<void> {
  try {
    const {
      message,
      clientIds = [],
      employeeIds = [],
      otherRecipients = [],
    } = req.body ?? {};

    if (!message || typeof message !== "string" || message.trim() === "") {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const isStringArray = (v: unknown): v is string[] =>
      Array.isArray(v) && v.every((x) => typeof x === "string");
    if (!isStringArray(clientIds) || !isStringArray(employeeIds)) {
      res
        .status(400)
        .json({ error: "clientIds and employeeIds must be arrays of IDs" });
      return;
    }
    if (!Array.isArray(otherRecipients)) {
      res.status(400).json({ error: "otherRecipients must be an array" });
      return;
    }
    for (let i = 0; i < otherRecipients.length; i++) {
      const o = otherRecipients[i];
      if (!o || typeof o.name !== "string" || !o.name.trim()) {
        res
          .status(400)
          .json({ error: `otherRecipients[${i}].name is required` });
        return;
      }
      if (typeof o.phone !== "string" || !bulkSmsService.toValidKenyanMobile(o.phone)) {
        res.status(400).json({
          error: `${o.name.trim()}: "${o.phone}" is not a valid Kenyan mobile number`,
        });
        return;
      }
    }
    if (
      clientIds.length === 0 &&
      employeeIds.length === 0 &&
      otherRecipients.length === 0
    ) {
      res.status(400).json({ error: "Select at least one recipient" });
      return;
    }

    const result = await bulkSmsService.sendBroadcast({
      message: message.trim(),
      clientIds,
      employeeIds,
      otherRecipients: otherRecipients.map(
        (o: { name: string; phone: string }) => ({
          name: o.name.trim(),
          phone: o.phone.trim(),
        })
      ),
      performedBy: req.employee?.id,
    });

    res.json(result);
  } catch (error) {
    console.error("Error sending broadcast SMS:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send broadcast SMS";
    res.status(500).json({ error: message });
  }
}

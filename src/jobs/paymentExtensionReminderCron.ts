import cron from "node-cron";
import { sendPaymentExtensionReminders } from "../services/paymentReminderService.js";

// Run daily at 8:00 AM (Africa/Nairobi) – clients with extension due in 1–3 days get a reminder
const CRON_SCHEDULE = "0 8 * * *";
const TIMEZONE = "Africa/Nairobi";

export function startPaymentExtensionReminderCron(): void {
  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      const now = new Date();
      console.log(
        `[Payment Extension Reminder Cron] Running at ${now.toISOString()} (${TIMEZONE})`
      );
      try {
        const result = await sendPaymentExtensionReminders(now);
        console.log(
          `[Payment Extension Reminder Cron] Sent: ${result.sent}, Skipped: ${result.skipped}, Director summary: ${result.directorSummarySent}`
        );
        if (result.errors.length > 0) {
          console.error(
            "[Payment Extension Reminder Cron] Errors:",
            JSON.stringify(result.errors, null, 2)
          );
        }
      } catch (err) {
        console.error(
          "[Payment Extension Reminder Cron] Failed:",
          err
        );
      }
    },
    {
      timezone: TIMEZONE,
    }
  );
  console.log(
    `[Payment Extension Reminder Cron] Scheduled: ${CRON_SCHEDULE} (${TIMEZONE})`
  );
}

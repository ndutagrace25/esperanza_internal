import cron from "node-cron";
import { sendPaymentReminders } from "../services/paymentReminderService.js";

const CRON_SCHEDULE = "0 8 1,2,3 * *"; // 8:00 AM on 1st, 2nd, 3rd of every month
const TIMEZONE = "Africa/Nairobi";

export function startPaymentReminderCron(): void {
  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      const now = new Date();
      console.log(
        `[Payment Reminder Cron] Running at ${now.toISOString()} (${TIMEZONE})`
      );
      try {
        const result = await sendPaymentReminders(now);
        console.log(
          `[Payment Reminder Cron] Sent: ${result.sent}, Skipped: ${result.skipped}, Director summary: ${result.directorSummarySent}`
        );
        if (result.errors.length > 0) {
          console.error(
            "[Payment Reminder Cron] Errors:",
            JSON.stringify(result.errors, null, 2)
          );
        }
      } catch (err) {
        console.error("[Payment Reminder Cron] Failed:", err);
      }
    },
    {
      timezone: TIMEZONE,
    }
  );
  console.log(
    `[Payment Reminder Cron] Scheduled: ${CRON_SCHEDULE} (${TIMEZONE})`
  );
}

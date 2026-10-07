import cron from "node-cron";
import { checkSmsBalanceAndNotify } from "../services/smsBalanceService.js";

const CRON_SCHEDULE = "0 8 * * *"; // 8:00 AM every day
const TIMEZONE = "Africa/Nairobi";

export function startSmsBalanceCron(): void {
  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      const now = new Date();
      console.log(
        `[SMS Balance Cron] Running at ${now.toISOString()} (${TIMEZONE})`
      );
      try {
        const result = await checkSmsBalanceAndNotify();
        console.log(
          `[SMS Balance Cron] Credit: ${result.credit}, Threshold: ${result.threshold}, Low: ${result.isLow}, Director SMS: ${result.directorSmsSent}, Director emails: ${result.directorEmailsSent}`
        );
        if (result.errors.length > 0) {
          console.error(
            "[SMS Balance Cron] Errors:",
            JSON.stringify(result.errors, null, 2)
          );
        }
      } catch (err) {
        console.error("[SMS Balance Cron] Failed:", err);
      }
    },
    {
      timezone: TIMEZONE,
    }
  );
  console.log(`[SMS Balance Cron] Scheduled: ${CRON_SCHEDULE} (${TIMEZONE})`);
}

import cron from "node-cron";
import { sendWeekendReminder } from "../services/standbyService.js";

const CRON_SCHEDULE = "0 9 * * 6"; // 9:00 AM every Saturday
const TIMEZONE = "Africa/Nairobi";

export function startStandbyReminderCron(): void {
  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      const now = new Date();
      console.log(
        `[Standby Reminder Cron] Running at ${now.toISOString()} (${TIMEZONE})`
      );
      try {
        const result = await sendWeekendReminder({}, now);
        if (result.skipped) {
          console.log(`[Standby Reminder Cron] Skipped: ${result.skipped}`);
        } else {
          console.log(
            `[Standby Reminder Cron] Standby: ${result.standby} (${result.when}), SMS sent: ${result.sent}`
          );
        }
        if (result.errors.length > 0) {
          console.error(
            "[Standby Reminder Cron] Errors:",
            JSON.stringify(result.errors, null, 2)
          );
        }
      } catch (err) {
        console.error("[Standby Reminder Cron] Failed:", err);
      }
    },
    {
      timezone: TIMEZONE,
    }
  );
  console.log(
    `[Standby Reminder Cron] Scheduled: ${CRON_SCHEDULE} (${TIMEZONE})`
  );
}

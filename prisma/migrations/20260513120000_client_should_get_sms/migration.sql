-- Opt out of payment / extension reminder SMS only (default: receive reminders)
ALTER TABLE "clients" ADD COLUMN "reminder_sms" BOOLEAN NOT NULL DEFAULT true;

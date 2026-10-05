-- Sales app login: email + 4-digit PIN, temporary PIN for first login / reset
ALTER TABLE "sales_people"
  ADD COLUMN "pin_hash" TEXT,
  ADD COLUMN "pin_set_at" TIMESTAMP(3),
  ADD COLUMN "temp_pin_hash" TEXT,
  ADD COLUMN "temp_pin_expires_at" TIMESTAMP(3),
  ADD COLUMN "temp_pin_sent_at" TIMESTAMP(3),
  ADD COLUMN "temp_pin_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pin_locked_until" TIMESTAMP(3),
  ADD COLUMN "last_login_at" TIMESTAMP(3);

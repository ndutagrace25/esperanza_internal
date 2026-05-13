-- If an older draft added should_get_sms, align with reminder_sms (no-op otherwise).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'should_get_sms'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'reminder_sms'
  ) THEN
    ALTER TABLE "clients" RENAME COLUMN "should_get_sms" TO "reminder_sms";
  END IF;
END $$;

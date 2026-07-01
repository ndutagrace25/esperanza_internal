ALTER TABLE "client_subscriptions"
  ADD COLUMN IF NOT EXISTS "api_user_name" TEXT,
  ADD COLUMN IF NOT EXISTS "api_password" TEXT;

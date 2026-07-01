-- Open ERP renew endpoints: drop unused credential columns if present
ALTER TABLE "client_subscriptions" DROP COLUMN IF EXISTS "api_user_name";
ALTER TABLE "client_subscriptions" DROP COLUMN IF EXISTS "api_password";

-- Ventura licensing: installation binding, signed licence and check-ins
ALTER TABLE "client_subscriptions"
  ADD COLUMN "installation_id" TEXT,
  ADD COLUMN "activation_key" TEXT,
  ADD COLUMN "license_token" TEXT,
  ADD COLUMN "license_issued_at" TIMESTAMP(3),
  ADD COLUMN "last_check_in_at" TIMESTAMP(3),
  ADD COLUMN "last_check_in_ip" TEXT,
  ADD COLUMN "last_check_in_version" TEXT,
  ADD COLUMN "conflict_installation_id" TEXT,
  ADD COLUMN "conflict_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "client_subscriptions_activation_key_key" ON "client_subscriptions"("activation_key");

-- Licensing safeguards: expiry kept from the hotel on first check-in, and
-- automatic re-binding to a new installation
ALTER TABLE "client_subscriptions"
  ADD COLUMN "expiry_adjusted_from" TIMESTAMP(3),
  ADD COLUMN "expiry_adjusted_at" TIMESTAMP(3),
  ADD COLUMN "previous_installation_id" TEXT,
  ADD COLUMN "rebound_at" TIMESTAMP(3);

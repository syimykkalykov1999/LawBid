SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-05: after the client changes an open case, active bids wait
-- for the attorney's «Бид в силе». Only additions; old builds never read these.
ALTER TABLE "bids" ADD COLUMN "confirmation_required_at" TIMESTAMPTZ;
ALTER TABLE "bids" ADD COLUMN "confirmed_at" TIMESTAMPTZ;
ALTER TABLE "bids" ADD COLUMN "confirm_reminded_at" TIMESTAMPTZ;
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'bid_changed';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'bid_confirm_reminder';

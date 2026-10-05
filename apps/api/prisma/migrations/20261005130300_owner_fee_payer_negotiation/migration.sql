-- Owner 2026-10-05 03:03: who covers Stripe's fee is agreed per invoice like
-- a bid (proposed / countered / agreed, capped rounds).
ALTER TABLE "payment_requests" ADD COLUMN "fee_payer_status" STRING(16) NOT NULL DEFAULT 'proposed';
ALTER TABLE "payment_requests" ADD COLUMN "fee_payer_by" STRING(16) NOT NULL DEFAULT 'attorney';
ALTER TABLE "payment_requests" ADD COLUMN "fee_payer_rounds" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "payment_requests" ADD COLUMN "fee_payer_agreed_at" TIMESTAMPTZ;
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_fee_countered';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payment_fee_agreed';

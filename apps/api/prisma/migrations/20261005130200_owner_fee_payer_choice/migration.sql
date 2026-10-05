-- Owner 2026-10-05: who covers Stripe's card fee is the attorney's choice
-- (default per attorney, override per invoice); the admin value is only
-- the default for attorneys who have not chosen.
ALTER TABLE "payout_accounts" ADD COLUMN "processing_fee_payer" STRING(16);
ALTER TABLE "payment_requests" ADD COLUMN "processing_fee_payer" STRING(16) NOT NULL DEFAULT 'client';

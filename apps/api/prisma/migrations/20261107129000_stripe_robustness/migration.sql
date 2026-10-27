-- Stripe robustness (2026-10-27): dispute tracking on case payments, payout
-- hold / failure markers on payout accounts, and the unified review queue.
ALTER TABLE "case_payments"
  ADD COLUMN "dispute_id" VARCHAR(64),
  ADD COLUMN "dispute_reason" VARCHAR(64),
  ADD COLUMN "dispute_amount_cents" INTEGER,
  ADD COLUMN "dispute_due_by" TIMESTAMPTZ,
  ADD COLUMN "dispute_evidence_status" VARCHAR(16),
  ADD COLUMN "dispute_funds_withdrawn_at" TIMESTAMPTZ,
  ADD COLUMN "dispute_funds_reinstated_at" TIMESTAMPTZ;

ALTER TABLE "payout_accounts"
  ADD COLUMN "payouts_held" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payouts_hold_reason" VARCHAR(200),
  ADD COLUMN "payouts_held_at" TIMESTAMPTZ,
  ADD COLUMN "last_payout_failure_at" TIMESTAMPTZ,
  ADD COLUMN "last_payout_failure_code" VARCHAR(100),
  ADD COLUMN "deauthorized_at" TIMESTAMPTZ;

CREATE TABLE "stripe_review_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'open',
  "stripe_ref" VARCHAR(80) NOT NULL,
  "case_payment_id" UUID,
  "user_id" UUID,
  "amount_cents" INTEGER,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
  "summary" VARCHAR(300) NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "due_at" TIMESTAMPTZ,
  "reminded_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by" UUID,
  "resolution" VARCHAR(300),
  CONSTRAINT "stripe_review_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stripe_review_items_kind_stripe_ref_key" ON "stripe_review_items"("kind", "stripe_ref");
CREATE INDEX "stripe_review_items_status_due_at_idx" ON "stripe_review_items"("status", "due_at");
CREATE INDEX "stripe_review_items_case_payment_id_idx" ON "stripe_review_items"("case_payment_id");

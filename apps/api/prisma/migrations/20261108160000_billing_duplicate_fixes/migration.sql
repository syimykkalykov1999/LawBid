SET LOCAL lock_timeout = '5s';
-- Algo audit M-4 (owner 2026-10-28): duplicate Stripe subscriptions of one
-- attorney (a second device, a re-subscription after grace) are resolved
-- automatically — one row per duplicate (unique: retries are idempotent).
-- Expand-only: a new table nobody reads yet; the running release ignores it.
CREATE TABLE "billing_duplicate_fixes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "kept_subscription_id" VARCHAR(80) NOT NULL,
  "duplicate_subscription_id" VARCHAR(80) NOT NULL,
  "trigger" VARCHAR(24) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "reason" VARCHAR(40),
  "charged_cents" INTEGER NOT NULL DEFAULT 0,
  "refund_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
  "stripe_invoice_id" VARCHAR(80),
  "payment_id" UUID,
  "refund_id" UUID,
  "canceled_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "billing_duplicate_fixes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_duplicate_fixes_duplicate_subscription_id_key" ON "billing_duplicate_fixes"("duplicate_subscription_id");
CREATE INDEX "billing_duplicate_fixes_user_id_created_at_idx" ON "billing_duplicate_fixes"("user_id", "created_at" DESC);
CREATE INDEX "billing_duplicate_fixes_created_at_id_idx" ON "billing_duplicate_fixes"("created_at" DESC, "id" DESC);

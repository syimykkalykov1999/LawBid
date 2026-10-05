-- Owner 2026-10-05: client → attorney payments through the platform
-- (Stripe Connect Express, direct charges): the attorney's payout
-- account, the payments themselves and their refunds. Additive.

-- CreateTable
CREATE TABLE "payout_accounts" (
    "user_id" UUID NOT NULL,
    "provider" STRING(16) NOT NULL DEFAULT 'stripe',
    "stripe_account_id" STRING NOT NULL,
    "status" STRING(16) NOT NULL DEFAULT 'pending',
    "charges_enabled" BOOL NOT NULL DEFAULT false,
    "payouts_enabled" BOOL NOT NULL DEFAULT false,
    "details_submitted" BOOL NOT NULL DEFAULT false,
    "requirements_due" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[],
    "disabled_reason" STRING(200),
    "country" STRING(2),
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "case_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "bid_id" UUID,
    "client_id" UUID NOT NULL,
    "attorney_id" UUID NOT NULL,
    "kind" STRING(16) NOT NULL,
    "status" STRING(24) NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "platform_fee_cents" INT4 NOT NULL DEFAULT 0,
    "processing_fee_cents" INT4 NOT NULL DEFAULT 0,
    "client_total_cents" INT4 NOT NULL,
    "attorney_net_cents" INT4 NOT NULL,
    "fee_type" STRING(16) NOT NULL,
    "fee_payer" STRING(16) NOT NULL,
    "currency" STRING(3) NOT NULL DEFAULT 'usd',
    "note" STRING(200),
    "stripe_account_id" STRING,
    "stripe_checkout_id" STRING,
    "stripe_payment_intent_id" STRING,
    "stripe_charge_id" STRING,
    "receipt_url" STRING,
    "refunded_cents" INT4 NOT NULL DEFAULT 0,
    "dispute_status" STRING(32),
    "disputed_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "canceled_reason" STRING(100),
    "failure_code" STRING(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "case_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_payment_refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "amount_cents" INT4 NOT NULL,
    "reason" STRING(500) NOT NULL,
    "initiated_by_type" STRING(16) NOT NULL,
    "initiated_by" UUID,
    "stripe_refund_id" STRING,
    "status" STRING(16) NOT NULL,
    "failure_reason" STRING,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "case_payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payout_accounts_stripe_account_id_key" ON "payout_accounts"("stripe_account_id");

-- CreateIndex
CREATE INDEX "payout_accounts_status_idx" ON "payout_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "case_payments_stripe_checkout_id_key" ON "case_payments"("stripe_checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "case_payments_stripe_payment_intent_id_key" ON "case_payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "case_payments_case_id_created_at_idx" ON "case_payments"("case_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_payments_client_id_created_at_idx" ON "case_payments"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_payments_attorney_id_created_at_idx" ON "case_payments"("attorney_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "case_payments_status_created_at_idx" ON "case_payments"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "case_payment_refunds_stripe_refund_id_key" ON "case_payment_refunds"("stripe_refund_id");

-- CreateIndex
CREATE INDEX "case_payment_refunds_payment_id_idx" ON "case_payment_refunds"("payment_id");

-- Validated by the API; CHECKs keep stray values out.
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_status_check"
  CHECK (status IN ('pending', 'onboarding', 'active', 'restricted', 'disabled'));
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_kind_check"
  CHECK (kind IN ('bid', 'deposit', 'balance', 'custom'));
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_status_check"
  CHECK (status IN ('pending_payment', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded', 'disputed'));
ALTER TABLE "case_payments" ADD CONSTRAINT "case_payments_amount_check"
  CHECK (amount_cents > 0 AND platform_fee_cents >= 0 AND processing_fee_cents >= 0 AND client_total_cents > 0 AND attorney_net_cents >= 0 AND refunded_cents >= 0);
ALTER TABLE "case_payment_refunds" ADD CONSTRAINT "case_payment_refunds_amount_check"
  CHECK (amount_cents > 0);

-- Notification types of the payment events.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_payment_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_payment_sent';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_payment_refunded';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'case_payment_disputed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'payout_account_status';

-- The feature flag: off until the owner connects Stripe and switches it on
-- (the admin refuses to enable it without the Stripe keys).
INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('payments_in_app', false, 100, 'Clients pay the accepted attorney through the platform (Stripe Connect)', now())
ON CONFLICT (key) DO NOTHING;

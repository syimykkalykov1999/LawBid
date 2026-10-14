-- Owner 2026-10-14: offers per month are a plan term (spam protection).
-- Existing paid attorney plans get 30; the baseline (no paid plan) is 3 in
-- code (BASELINE_DEFAULTS) and changes in the admin like every other term.
UPDATE plans
   SET entitlements = entitlements || '{"bids_per_month": 30}'::jsonb
 WHERE kind = 'paid'
   AND audience = 'attorney'
   AND NOT (entitlements ? 'bids_per_month');

-- Trial: 14 days or 5 offers, whichever ends first (the owner edits both per
-- plan in the admin).
UPDATE plans
   SET entitlements = entitlements || '{"trial_bids": 5}'::jsonb
 WHERE kind = 'paid'
   AND audience = 'attorney'
   AND NOT (entitlements ? 'trial_bids');

UPDATE plans
   SET entitlements = entitlements || '{"trial_days": 14}'::jsonb
 WHERE kind = 'paid'
   AND audience = 'attorney'
   AND (entitlements->>'trial_days') = '7';

-- Attorney statistics: profile views per day.
CREATE TABLE "attorney_profile_views" (
    "attorney_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attorney_profile_views_pkey" PRIMARY KEY ("attorney_id","day")
);

-- Offer packs: one-time purchases on top of the monthly limit.
CREATE TABLE "bid_pack_purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "pack_id" VARCHAR(40) NOT NULL,
    "bids" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
    "stripe_checkout_id" TEXT,
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ,

    CONSTRAINT "bid_pack_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bid_pack_purchases_stripe_checkout_id_key" ON "bid_pack_purchases"("stripe_checkout_id");
CREATE INDEX "bid_pack_purchases_user_id_created_at_idx" ON "bid_pack_purchases"("user_id", "created_at" DESC);

CREATE TABLE "bid_credits" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_credits_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "bid_credits" ADD CONSTRAINT "bid_credits_balance_ck" CHECK ("balance" >= 0);

-- Owner 2026-10-07: a boost is paid per impressions, people, taps or real
-- actions, each with its own admin price (promotions.settings.pricing).
ALTER TABLE "case_promotions" ADD COLUMN IF NOT EXISTS "actions" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN IF NOT EXISTS "billed_actions" STRING[] DEFAULT ARRAY[]::STRING[];
ALTER TABLE "case_promotions" ADD COLUMN IF NOT EXISTS "billing" STRING(12) NOT NULL DEFAULT 'impressions';
ALTER TABLE "case_promotions" ADD COLUMN IF NOT EXISTS "target_units" INT4;
ALTER TABLE "case_promotions" ADD COLUMN IF NOT EXISTS "unit_price_cents" INT4;

ALTER TABLE "promotion_views" ADD COLUMN IF NOT EXISTS "acted" BOOL NOT NULL DEFAULT false;

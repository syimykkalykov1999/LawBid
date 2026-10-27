-- Owner 2026-10-27 (rewrite of #112): a boost is paid per views, people,
-- taps or real actions, each with its own admin price
-- (app_config promotions.settings.pricing). Additive only: every new column
-- is nullable or has a constant default (metadata-only, no table rewrite), so
-- the previous release keeps working on the new schema.
-- A query waiting for the lock must not queue everything behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "case_promotions" ADD COLUMN "billing" VARCHAR(12) NOT NULL DEFAULT 'impressions';
ALTER TABLE "case_promotions" ADD COLUMN "unit_price_cents" INTEGER;
ALTER TABLE "case_promotions" ADD COLUMN "target_units" INTEGER;
ALTER TABLE "case_promotions" ADD COLUMN "actions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "case_promotions" ADD COLUMN "billed_actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- A real action is counted once per person (like clicked for taps).
ALTER TABLE "promotion_views" ADD COLUMN "acted" BOOLEAN NOT NULL DEFAULT false;

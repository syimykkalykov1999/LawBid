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

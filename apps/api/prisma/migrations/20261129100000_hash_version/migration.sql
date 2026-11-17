SET LOCAL lock_timeout = '5s';
-- Owner row 150: per-experiment / per-flag bucketing hash.
-- 1 = the original FNV-1a (hash01), 2 = GrowthBook SDK hash v2.
-- Additive only. ADD COLUMN with a constant default is a catalog-only change
-- (no rewrite) and fills every existing row with 1, so nobody changes group;
-- the default is then switched to 2 so rows created from now on get the
-- unbiased hash.
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "hash_version" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "experiments" ALTER COLUMN "hash_version" SET DEFAULT 2;

ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "hash_version" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "feature_flags" ALTER COLUMN "hash_version" SET DEFAULT 2;

-- Owner row 150: per-experiment / per-flag bucketing hash version.
-- 1 = the original FNV-1a (hash01), 2 = GrowthBook hash v2 (double FNV-1a,
-- unbiased on similar ids, independent between experiments).
-- Every existing row gets 1 (filled by the ADD COLUMN default, so nobody
-- changes variant or rollout bucket); the default then becomes 2 for new rows.
-- Additive only: ADD COLUMN with a constant default is a catalog change on
-- PG 11+ (no rewrite); SET DEFAULT touches no rows.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "hash_version" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "experiments" ALTER COLUMN "hash_version" SET DEFAULT 2;
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "hash_version" SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE "feature_flags" ALTER COLUMN "hash_version" SET DEFAULT 2;

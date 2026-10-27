-- Owner 2026-10-29: home_region for future data residency (everyone 'us',
-- nothing reads it for routing; the erasure certificate records it).
-- Merge after PR #360 (privacy-hardening): the erasure registry keeps its
-- per-store results in that PR's deletion_steps table.
ALTER TABLE "users" ADD COLUMN "home_region" VARCHAR(8) NOT NULL DEFAULT 'us';
ALTER TABLE "shard_map" ADD COLUMN "region" VARCHAR(8) NOT NULL DEFAULT 'us';

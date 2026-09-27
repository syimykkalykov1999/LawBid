-- Fix for stage 2.6: trigram GIN indexes can't be declared with Prisma's
-- CockroachDB connector (no gin_trgm_ops support), so Prisma's diff wanted to
-- drop them. Recreated as partial indexes, which Prisma ignores. The planner
-- uses them for LIKE/ILIKE '%term%' (verified with EXPLAIN); the `%`
-- similarity operator does not use a trigram index on this CockroachDB
-- version, so search (docs/05 stage 5.6) filters with LIKE and ranks with
-- similarity().
DROP INDEX IF EXISTS "users"@"users_full_name_trgm_idx";
DROP INDEX IF EXISTS "attorney_profiles"@"attorney_profiles_username_trgm_idx";
DROP INDEX IF EXISTS "tags"@"tags_tag_trgm_idx";

CREATE INVERTED INDEX "users_full_name_trgm_idx" ON "users" ("full_name_lower" gin_trgm_ops)
  WHERE "full_name_lower" IS NOT NULL;
CREATE INVERTED INDEX "attorney_profiles_username_trgm_idx" ON "attorney_profiles" ("username_lower" gin_trgm_ops)
  WHERE "username_lower" IS NOT NULL;
CREATE INVERTED INDEX "tags_tag_trgm_idx" ON "tags" ("tag_lower" gin_trgm_ops)
  WHERE "tag_lower" IS NOT NULL;

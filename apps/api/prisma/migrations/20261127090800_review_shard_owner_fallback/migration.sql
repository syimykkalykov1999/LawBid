-- Two databases: a review written without a shared case had no shard key
-- (shard 0, the primary), while every read of it went to the shard
-- databases. It now lives with its author, like a consultation without a
-- case (manifest: Review -> client_id, ClientReview -> attorney_id).
-- Regenerated triggers (scripts/generate-shard-trigger-migration.ts):
DROP TRIGGER IF EXISTS "client_reviews_shard_fill" ON "client_reviews";
CREATE TRIGGER "client_reviews_shard_fill" BEFORE INSERT ON "client_reviews" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases', 'owner', 'attorney_id', '');
DROP TRIGGER IF EXISTS "reviews_shard_fill" ON "reviews";
CREATE TRIGGER "reviews_shard_fill" BEFORE INSERT ON "reviews" FOR EACH ROW WHEN (NEW."shard_id" = 0) EXECUTE FUNCTION lawbid_shard_fill('parent', 'case_id', 'cases', 'owner', 'client_id', '');
-- Existing case-less reviews, then their children (same rule as the
-- 20261024140100 backfill: the last byte of the owner's uuid).
UPDATE "reviews" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."client_id"), 15), 0) WHERE c."case_id" IS NULL;
UPDATE "client_reviews" c SET "shard_id" = COALESCE(get_byte(uuid_send(c."attorney_id"), 15), 0) WHERE c."case_id" IS NULL;
UPDATE "review_helpful_votes" c SET "shard_id" = p."shard_id" FROM "reviews" p WHERE p."id" = c."review_id" AND p."case_id" IS NULL;
UPDATE "client_review_helpful_votes" c SET "shard_id" = p."shard_id" FROM "client_reviews" p WHERE p."id" = c."review_id" AND p."case_id" IS NULL;
UPDATE "client_review_appeals" c SET "shard_id" = p."shard_id" FROM "client_reviews" p WHERE p."id" = c."review_id" AND p."case_id" IS NULL;

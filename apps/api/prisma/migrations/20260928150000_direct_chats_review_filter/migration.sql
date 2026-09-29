-- 2026-09-28: prepared for profile-started chats; the owner then kept
-- chats case-only (docs/04 §9, OQ-014), so nothing writes NULL today.
-- Applied to dev DBs already; kept as-is (harmless, avoids a checksum
-- mismatch).
ALTER TABLE "conversations" ALTER COLUMN "case_id" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_direct_uq"
  ON "conversations" ("attorney_id", "client_id")
  WHERE "case_id" IS NULL;

-- Reviews filtered by stars (owner request): (attorney, rating, newest).
CREATE INDEX IF NOT EXISTS "reviews_attorney_rating_created_idx"
  ON "reviews" ("attorney_id", "rating", "created_at" DESC)
  WHERE "status" = 'published';

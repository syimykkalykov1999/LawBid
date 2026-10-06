-- Existing posts: a law topic or News = legal, the rest stay general.
-- A separate migration: CockroachDB can't use a column added in the same
-- transaction.
UPDATE "posts" SET "content_class" = 'legal'
  WHERE "practice_area_id" IS NOT NULL OR "kind" = 'news';
CREATE INDEX "posts_content_class_created_at_idx" ON "posts"("content_class", "created_at" DESC);

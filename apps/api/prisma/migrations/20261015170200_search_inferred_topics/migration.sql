-- Owner 2026-10-15: a post with no topic, or a case filed under "not sure /
-- other", gets the topic its own words name in the synonym dictionary (set
-- by a small job, used only by search).
ALTER TABLE "posts" ADD COLUMN "inferred_practice_id" UUID;
ALTER TABLE "posts" ADD COLUMN "topic_scanned_at" TIMESTAMPTZ(6);
ALTER TABLE "cases" ADD COLUMN "inferred_practice_id" UUID;
ALTER TABLE "cases" ADD COLUMN "topic_scanned_at" TIMESTAMPTZ(6);

CREATE INDEX "posts_topic_scan_idx" ON "posts"("created_at") WHERE "topic_scanned_at" IS NULL AND "practice_area_id" IS NULL;
CREATE INDEX "cases_topic_scan_idx" ON "cases"("created_at") WHERE "topic_scanned_at" IS NULL;
CREATE INDEX "posts_inferred_practice_idx" ON "posts"("inferred_practice_id") WHERE "inferred_practice_id" IS NOT NULL;
CREATE INDEX "cases_inferred_practice_idx" ON "cases"("inferred_practice_id") WHERE "inferred_practice_id" IS NOT NULL;

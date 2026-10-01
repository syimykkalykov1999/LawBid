-- Owner 2026-09-30: a post has a title, a qualification (practice
-- category or subcategory) and a kind — a regular post or News (attorneys
-- only). Older posts keep NULL title/practice and are kind 'post'.
CREATE TYPE "post_kind" AS ENUM ('post', 'news');

ALTER TABLE "posts" ADD COLUMN "title" STRING NULL;
ALTER TABLE "posts" ADD COLUMN "practice_area_id" UUID NULL;
ALTER TABLE "posts" ADD COLUMN "kind" "post_kind" NOT NULL DEFAULT 'post';
ALTER TABLE "posts" ADD CONSTRAINT "posts_title_len" CHECK ("title" IS NULL OR char_length("title") BETWEEN 1 AND 120);
ALTER TABLE "posts" ADD CONSTRAINT "posts_practice_area_id_fkey" FOREIGN KEY ("practice_area_id") REFERENCES "practice_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "posts_practice_area_id_created_at_idx" ON "posts"("practice_area_id", "created_at" DESC);
CREATE INDEX "posts_kind_created_at_idx" ON "posts"("kind", "created_at" DESC);

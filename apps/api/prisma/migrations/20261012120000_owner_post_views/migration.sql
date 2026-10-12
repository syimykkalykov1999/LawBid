-- Owner 2026-10-12: views of video posts / reels. One row per viewer and
-- post (POST /posts/:id/view, idempotent); posts.view_count is the hot
-- counter (Redis delta + flusher, nightly reconcile from post_views).
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "view_count" INT4 NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "post_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "post_views_post_id_idx" ON "post_views"("post_id");
CREATE UNIQUE INDEX IF NOT EXISTS "post_views_user_id_post_id_key" ON "post_views"("user_id", "post_id");

ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

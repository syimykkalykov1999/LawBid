-- Owner 2026-10-07: Threads-style reposts. One row per user and post
-- (POST/DELETE /posts/:id/repost, idempotent); not of one's own post
-- (checked in the service). Rows go with the post or the user.
CREATE TABLE IF NOT EXISTS "post_reposts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reposts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "post_reposts_post_id_idx" ON "post_reposts"("post_id");
CREATE INDEX IF NOT EXISTS "post_reposts_user_id_created_at_idx" ON "post_reposts"("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "post_reposts_user_id_post_id_key" ON "post_reposts"("user_id", "post_id");

ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

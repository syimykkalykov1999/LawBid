-- Share counter of channel posts (one share per person per post per 24 h).
ALTER TABLE "channel_posts" ADD COLUMN "share_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "channel_post_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_post_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "channel_post_shares_post_id_user_id_created_at_idx" ON "channel_post_shares"("post_id", "user_id", "created_at");

ALTER TABLE "channel_post_shares" ADD CONSTRAINT "channel_post_shares_post_fkey" FOREIGN KEY ("post_id") REFERENCES "channel_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

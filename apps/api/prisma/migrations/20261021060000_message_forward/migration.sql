-- Owner 2026-10-21 (Telegram «Переслать»): forwarded group messages and
-- channel posts show «Forwarded from <name>»; a retried forward into a
-- channel finds its post by forward_key. Additive columns only.
ALTER TABLE "chat_group_messages" ADD COLUMN "forwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_group_messages" ADD COLUMN "forwarded_from_name" VARCHAR(120);
ALTER TABLE "channel_posts" ADD COLUMN "forwarded_from_name" VARCHAR(120);
ALTER TABLE "channel_posts" ADD COLUMN "forward_key" VARCHAR(64);
CREATE UNIQUE INDEX "channel_posts_forward_key_key" ON "channel_posts"("channel_id", "author_id", "forward_key");

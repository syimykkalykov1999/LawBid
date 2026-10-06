-- Owner 2026-10-05: legal posts vs general (personal) posts. Every post is
-- 'legal' (a law topic, News, or marked by its author) or 'general'; a
-- viewer can hide general posts from the feed, search and recommendations.
ALTER TABLE "posts" ADD COLUMN "content_class" STRING(16) NOT NULL DEFAULT 'general';
ALTER TABLE "posts" ADD COLUMN "content_class_locked" BOOL NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "feed_content_mode" STRING(16);

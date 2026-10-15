-- Owner 2026-10-15 (Instagram): the author of a post / reel can hide its like
-- counter and its view counter from everyone else; a viewer can hide like
-- counters on other people's posts.
ALTER TABLE "posts" ADD COLUMN "hide_likes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "posts" ADD COLUMN "hide_views" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "hide_like_counts" BOOLEAN NOT NULL DEFAULT false;

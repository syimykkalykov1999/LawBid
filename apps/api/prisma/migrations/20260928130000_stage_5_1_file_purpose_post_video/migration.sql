-- docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §14 (stage 5.1): video posts are
-- prepared now and enabled later by the `video_posts` flag (§3.6).
-- Separate migration: CockroachDB can't use a new enum value in the same
-- transaction that adds it.
ALTER TYPE "file_purpose" ADD VALUE 'post_video';

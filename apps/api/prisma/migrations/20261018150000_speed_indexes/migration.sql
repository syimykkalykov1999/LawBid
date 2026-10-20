-- Owner 2026-10-18 (speed): three partial indexes for the hottest list
-- queries, so each reads only the rows it can show instead of sorting a
-- wider scan:
--   * reels: published, not deleted video posts, newest first;
--   * the attorneys' case feed: open, not deleted, not paused, newest first;
--   * the chat gallery: attachment messages of a conversation, newest first.
-- Raw SQL partial indexes (Prisma ignores them in its diff, like the other
-- WHERE indexes). Plain CREATE INDEX: Prisma runs a migration in a
-- transaction, where CONCURRENTLY is not allowed.
CREATE INDEX IF NOT EXISTS posts_reels_created_idx
  ON public.posts USING btree (created_at DESC, id DESC)
  WHERE status = 'published' AND deleted_at IS NULL AND video_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cases_open_feed_created_idx
  ON public.cases USING btree (created_at DESC, id DESC)
  WHERE status = 'open' AND deleted_at IS NULL AND paused_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_attachments_idx
  ON public.messages USING btree (conversation_id, created_at DESC, id DESC)
  WHERE type = 'attachment' AND deleted_at IS NULL;

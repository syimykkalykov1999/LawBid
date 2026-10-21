-- Same reason as posts_visible_created_idx: a profile's posts and the
-- followed stream filter by author, newest first, with `status = $1`.
-- Built CONCURRENTLY (no write lock), one statement per file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_author_visible_idx
  ON public.posts USING btree (author_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

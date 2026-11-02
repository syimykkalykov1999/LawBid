SET LOCAL lock_timeout = '5s';
-- post_view_events had no index starting with created_at, so the nightly
-- retention (`created_at < cutoff`) read the whole table and the online
-- partition runner (batched copy by created_at) refused to start. A plain
-- index on created_at fixes both.
-- Plain CREATE INDEX: Prisma runs a migration in one transaction, where
-- CONCURRENTLY is not allowed (like 20261110090000_posts_text_trgm). The
-- table is small until launch, so the build takes milliseconds; on a big
-- table build it by hand with CONCURRENTLY first (IF NOT EXISTS then skips it).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS post_view_events_created_idx
  ON public.post_view_events USING btree (created_at);

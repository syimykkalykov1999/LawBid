SET LOCAL lock_timeout = '5s';
-- Verify 18.11, batch 13 (DB9): three schema.prisma indexes that another
-- index already covers, so every write to the table paid for them for
-- nothing (EXPLAIN in docs/dev/VERIFY_batch13_db_cache_servers_2026-11-18.md):
--   bids_status_idx (status)            = prefix of bids_status_created_at_id_idx
--   chat_group_polls_group_id_idx       = prefix of the UNIQUE (group_id, message_id)
--   post_media_file_id_idx (file_id)    = file_id is NOT NULL, so the UNIQUE
--     post_media_file_id_one_post_key (file_id) WHERE file_id IS NOT NULL
--     holds every row
-- They leave schema.prisma in the same change, so the drop is a migration
-- (the schema-drift check compares migrations with schema.prisma), like
-- 20261107109000_drop_posts_popular_idx: plain DROP INDEX, instant, inside
-- Prisma's transaction. The partial duplicates (not in schema.prisma) are
-- dropped CONCURRENTLY in prisma/concurrent/20261221100000_verify_batch13_indexes.sql.
-- A DROP INDEX inside the migration's transaction (a concurrent drop cannot
-- run there, and the drift check reads the migrations only): the drop itself
-- is a catalog change, the ACCESS EXCLUSIVE lock lasts an instant once taken,
-- and lock_timeout above stops it from queueing behind a long query. The
-- three tables are small before the release (bids, polls, post photos).
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS public.bids_status_idx;
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS public.chat_group_polls_group_id_idx;
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS public.post_media_file_id_idx;

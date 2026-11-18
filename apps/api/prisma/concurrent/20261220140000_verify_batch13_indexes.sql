-- Verify 18.11, batch 13 (database, cache, servers): background jobs that
-- read growing tables with no index under their filter, and indexes that
-- another index already covers. Every number below is EXPLAIN (ANALYZE,
-- BUFFERS) on PostgreSQL 16 on a migrated copy with seeded rows (findings
-- doc docs/dev/VERIFY_batch13_db_cache_servers_2026-11-18.md).
-- Partial on "column IS NOT NULL" (or on the job's own literal condition),
-- like the other concurrent indexes, so Prisma leaves them out of its schema
-- diff; a comparison `col = $1` / `col < $1` / `col @> $1` implies
-- `col IS NOT NULL`, also in a generic plan. Enum conditions stay index
-- columns, never partial predicates (KNOWN_ERRORS 118).

-- DB1. storage.cleanup (hourly) unused(): ~30 NOT EXISTS checks per live
-- file. The OR / array / jsonb checks below had no index, so each was a
-- full scan of that table per file. 400 000 live files, 50 000 channel
-- posts, 20 000 deal records + sign requests, 10 000 verifications:
-- 499 212 ms -> 3 490 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS deal_records_unsigned_file_idx
  ON deal_records (unsigned_file_id) WHERE unsigned_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS deal_records_sealed_file_idx
  ON deal_records (sealed_file_id) WHERE sealed_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS deal_records_agreement_file_idx
  ON deal_records (agreement_file_id) WHERE agreement_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_sign_requests_source_file_idx
  ON case_sign_requests (source_file_id) WHERE source_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_sign_requests_final_file_idx
  ON case_sign_requests (final_file_id) WHERE final_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_expenses_receipt_file_idx
  ON case_expenses (receipt_file_id) WHERE receipt_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS channels_avatar_file_idx
  ON channels (avatar_file_id) WHERE avatar_file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS data_export_jobs_file_idx
  ON data_export_jobs (file_id) WHERE file_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_documents_file_idx
  ON verification_documents (file_id) WHERE file_id IS NOT NULL;
-- The job says `cp.deleted_at IS NULL` literally.
CREATE INDEX CONCURRENTLY IF NOT EXISTS channel_posts_media_file_ids_idx
  ON channel_posts USING gin (media_file_ids) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS client_verifications_document_file_ids_idx
  ON client_verifications USING gin (document_file_ids jsonb_path_ops)
  WHERE document_file_ids IS NOT NULL;

-- DB2. storage.cleanup purge loop: `deleted_at < $1 AND purged_at IS NULL
-- ORDER BY deleted_at LIMIT 500` walked every purged row kept in
-- files_deleted_at_created_at_idx. 500 000 files, 99 000 purged:
-- 50 036 buffers / 78.7 ms -> 501 buffers / 1.8 ms per batch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS files_purge_due_idx
  ON files (deleted_at) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

-- DB3. storage.retention (nightly, batch after batch): post views and
-- channel post views older than the retention had no time index, so each
-- batch was a full scan + sort. 2 000 000 post views: 22 804 buffers /
-- 215 ms -> 1 003 buffers / 23 ms per 1 000-row batch (6 buffers when
-- nothing is due); 1 000 000 channel views: 91 ms -> 19 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS post_views_created_at_idx
  ON post_views (created_at) WHERE created_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS channel_post_views_viewed_at_idx
  ON channel_post_views (viewed_at) WHERE viewed_at IS NOT NULL;

-- DB4. consultations sweep (every minute) markEnded: raw SQL with the
-- literal 'open', so the partial predicate matches. 400 000 tasks:
-- seq scan 8 037 buffers / 117 ms -> 236 buffers / 5.9 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_tasks_open_consultation_idx
  ON attorney_tasks (consultation_id)
  WHERE status = 'open'::attorney_task_status AND consultation_id IS NOT NULL;

-- DB5. task reminders (every minute) rollSeries: series not yet rolled.
-- `repeat` is the leading column (Prisma sends it as a cast parameter, see
-- KNOWN_ERRORS 118); the job asks `repeat IN (...)`. 400 000 tasks:
-- 8 732 buffers / 68.7 ms -> 21 buffers / 0.18 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS attorney_tasks_series_due_idx
  ON attorney_tasks (repeat, due_at)
  WHERE repeated_at IS NULL AND archived_at IS NULL;

-- DB6. calls sweep (every minute) sweepVotes: `status = 'open' AND
-- expires_at <= $1`; only (call_id, status) existed. 200 000 votes:
-- 3 279 buffers / 26.5 ms -> 3 buffers / 0.11 ms.
CREATE INDEX CONCURRENTLY IF NOT EXISTS call_votes_status_expires_at_idx
  ON call_votes (status, expires_at) WHERE expires_at IS NOT NULL;

-- DB7. privacy reconcile (nightly): users anonymized in the look-back.
-- 300 000 users: 4 076 buffers (seq scan) -> 754.
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_anonymized_at_idx
  ON users (anonymized_at) WHERE anonymized_at IS NOT NULL;

-- DB8. exports cleanup (nightly): processed Stripe events older than 30
-- days; only the unprocessed partial index existed. 500 000 events:
-- seq scan 4 749 buffers -> 1 456 for a 5 000-row batch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS stripe_webhook_events_processed_idx
  ON stripe_webhook_events (processed_at) WHERE processed_at IS NOT NULL;

-- DB9. Duplicates: every one is covered by another index with the same
-- leading columns and the same condition, and each costs a write on every
-- insert/update of a hot table (notifications above all).
--  notifications_unread_idx (user_id) WHERE read_at IS NULL
--    = prefix of notifications_user_unread_idx (user_id, created_at DESC)
--  conversations_direct_pair_key: byte-for-byte the same UNIQUE index as
--    conversations_direct_uq (attorney_id, client_id) WHERE case_id IS NULL
--  bids_status_idx (status) = prefix of bids_status_created_at_id_idx
--  chat_group_polls_group_id_idx (group_id) = prefix of the UNIQUE
--    (group_id, message_id) key
--  post_media_file_id_idx (file_id): file_id is NOT NULL, so the UNIQUE
--    post_media_file_id_one_post_key (file_id) WHERE file_id IS NOT NULL
--    holds every row
-- The last three leave schema.prisma in the same change.
DROP INDEX CONCURRENTLY IF EXISTS notifications_unread_idx;
DROP INDEX CONCURRENTLY IF EXISTS conversations_direct_pair_key;
DROP INDEX CONCURRENTLY IF EXISTS bids_status_idx;
DROP INDEX CONCURRENTLY IF EXISTS chat_group_polls_group_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS post_media_file_id_idx;

-- Verify 18.11 (LD2): the nightly legal-retention scrub
-- (admin-data-requests/legal-retention.service.ts) picks rows deleted
-- (or revoked) before the cut-off whose text is not yet blanked. Its
-- comment promised `deleted_at` / `revoked_at` indexes, but none existed on
-- these tables, so every batch was a full scan of live content.
-- Partial on "deleted and not yet scrubbed", written exactly like the job's
-- raw SQL, so a scrubbed row leaves the index and the index stays the size
-- of the backlog. `deleted_at < $1` implies `deleted_at IS NOT NULL`, also
-- with a generic plan (checked with EXPLAIN on PostgreSQL 16, generic plan:
-- Bitmap Index Scan / BitmapOr on both message indexes, Index Scan on the
-- others). Partial indexes stay out of Prisma's schema diff, like the other
-- concurrent indexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_deleted_unscrubbed_idx
  ON messages (deleted_at)
  WHERE deleted_at IS NOT NULL AND (body_original <> '' OR body_display <> '');
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_revoked_unscrubbed_idx
  ON messages (revoked_at)
  WHERE revoked_at IS NOT NULL AND (body_original <> '' OR body_display <> '');
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_group_messages_deleted_unscrubbed_idx
  ON chat_group_messages (deleted_at)
  WHERE deleted_at IS NOT NULL AND body <> '';
CREATE INDEX CONCURRENTLY IF NOT EXISTS channel_posts_deleted_unscrubbed_idx
  ON channel_posts (deleted_at)
  WHERE deleted_at IS NOT NULL AND body <> '';
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_deleted_unscrubbed_idx
  ON posts (deleted_at)
  WHERE deleted_at IS NOT NULL AND (body <> '' OR title IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS stories_deleted_unscrubbed_idx
  ON stories (deleted_at)
  WHERE deleted_at IS NOT NULL AND text IS NOT NULL AND text <> '';
CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_questions_deleted_unscrubbed_idx
  ON legal_questions (deleted_at)
  WHERE deleted_at IS NOT NULL AND title <> '[removed]';
CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_answers_deleted_unscrubbed_idx
  ON legal_answers (deleted_at)
  WHERE deleted_at IS NOT NULL AND body <> '[removed after the retention period]';

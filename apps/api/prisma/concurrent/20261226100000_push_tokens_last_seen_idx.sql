-- G10 (25.11, docs/dev/STAGE2_ARCH_PERF_2026-11-25.md): the nightly
-- `push.tokens-stale` job (jobs/handlers/push-tokens-stale.job.ts) deletes
-- push tokens with last_seen_at older than push.token_stale_days in batches
-- ORDER BY last_seen_at LIMIT n. push_tokens had only (user_id) and the
-- unique fcm_token, so every batch was a full scan; with this index a batch
-- reads only the oldest rows. Partial on "last_seen_at IS NOT NULL" (always
-- true, the column is NOT NULL), like the other concurrent indexes, so
-- Prisma leaves it out of its schema diff.
CREATE INDEX CONCURRENTLY IF NOT EXISTS push_tokens_last_seen_at_idx
  ON push_tokens (last_seen_at) WHERE last_seen_at IS NOT NULL;

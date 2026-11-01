-- Load test 2026-10-28 (docs/perf/LOCAL_LOAD_TEST_2026-10-28.md).
-- #1 attorney case feed (cases-visible.sql.ts): one index range per
-- (state, topic) pair, newest first, with the exact keyset (created_at, id)
-- and the full "open" predicate (incl. paused_at), so each pair stops after
-- one page.
CREATE INDEX CONCURRENTLY IF NOT EXISTS cases_open_feed_pair_idx
  ON cases (primary_state_code, practice_area_id, created_at DESC, id DESC)
  WHERE status = 'open' AND deleted_at IS NULL AND paused_at IS NULL;
-- #1: the feed's "additional state" branch reads only non-primary rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_states_secondary_idx
  ON case_states (state_code, case_id)
  WHERE NOT is_primary;
-- #2 name search on the stored spelling keys (migration
-- 20261108100000_users_name_keys); the recheck compares plain text.
-- Partial (like users_full_name_trgm_idx) so Prisma leaves them out of its
-- diff; nameMatchSql always says `name_skel IS NOT NULL`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_name_skel_col_trgm_idx
  ON users USING gin (name_skel gin_trgm_ops)
  WHERE name_skel IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_name_cons_col_trgm_idx
  ON users USING gin (name_cons gin_trgm_ops)
  WHERE name_skel IS NOT NULL;

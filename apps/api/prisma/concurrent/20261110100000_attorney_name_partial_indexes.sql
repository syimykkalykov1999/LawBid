-- Load test 2026-11-02 (docs/perf/LOAD_TEST_2026-11-02.md): attorney search
-- by name read EVERY name match of every role and threw the clients away
-- (search/postgres-search.provider.ts: `role = 'attorney' AND name matches
-- ... LIMIT 1000`). The planner multiplies "10 % attorneys" by "N % match the
-- word", expects ~20 000 rows, assumes LIMIT 1000 is met after a short scan
-- and picks a sequential scan of the whole table (368 ms at 1M users, ~2.4 s
-- p95 with 1000 people searching on a 2-CPU database). When the word is
-- common among clients but absent among attorneys ("carter"), the scan never
-- stops early.
-- Partial indexes over the attorneys only (~10 % of the rows, ~13 % more
-- index size in total): the word is looked up among attorneys directly, the
-- empty answer costs 0.2 ms and no seq-scan plan is cheaper any more.
-- Predicates repeat what the query says (`role = 'attorney'`,
-- `full_name_lower IS NOT NULL`, `name_skel IS NOT NULL`) so that the
-- planner can prove they hold; the existing all-role indexes stay for the
-- queries without a role (admin, chats, followers).
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_att_full_name_trgm_idx
  ON users USING gin (full_name_lower gin_trgm_ops)
  WHERE role = 'attorney' AND full_name_lower IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_att_name_skel_trgm_idx
  ON users USING gin (name_skel gin_trgm_ops)
  WHERE role = 'attorney' AND name_skel IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_att_name_cons_trgm_idx
  ON users USING gin (name_cons gin_trgm_ops)
  WHERE role = 'attorney' AND name_skel IS NOT NULL;

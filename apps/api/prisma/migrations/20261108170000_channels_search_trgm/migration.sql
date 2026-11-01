SET LOCAL lock_timeout = '5s';
-- Audit 2026-11-01 (A-7): channel search is `title ILIKE '%term%' OR
-- username LIKE '%term%'` (Prisma `contains`) — a sequential scan of every
-- channel on each keystroke. Trigram GIN indexes (pg_trgm is already
-- installed, see the baseline) serve both arms. Plain CREATE INDEX: Prisma
-- runs a migration in one transaction, where CONCURRENTLY is not allowed
-- (like 20261029100000_hot_path_indexes); the table is small at launch.
-- Raw SQL only: Prisma does not model GIN/trigram indexes.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS channels_title_trgm_idx
  ON public.channels USING GIN (title public.gin_trgm_ops)
  WHERE status = 'active';
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS channels_username_trgm_idx
  ON public.channels USING GIN (username public.gin_trgm_ops)
  WHERE status = 'active';

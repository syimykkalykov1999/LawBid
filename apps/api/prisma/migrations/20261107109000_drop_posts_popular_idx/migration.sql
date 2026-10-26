-- Review R-27 (2026-10-26, follow-up to 20261029100000_hot_path_indexes).
-- posts_popular_idx was on (like_count, comment_count): two counters that
-- change on every flush. Each counter write made the row's index key change,
-- which rules out HOT updates, so every flush rewrote this index too (and
-- the posts table kept its dead tuples longer). The only "popular" query
-- (search sort=popular) orders by like_count + comment_count, a SUM the
-- index could never serve, so the index bought nothing. Plain DROP INDEX:
-- Prisma runs a migration in one transaction, and a drop is instant.
DROP INDEX IF EXISTS public.posts_popular_idx;

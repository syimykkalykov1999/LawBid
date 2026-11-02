SET LOCAL lock_timeout = '5s';
-- Audit 2026-11-01: Chinese / Japanese / Korean post search is a substring
-- (`ILIKE '%移民%'`), because those scripts have no spaces for the word
-- tokenizer. Measured on 300 000 posts: a scan is 330 ms (about 1.1 s at
-- 1 M, over the 700 ms search budget); with this trigram index a 3+ letter
-- query takes 1 ms. Two-letter queries cannot use trigrams; the search
-- limits those to the newest 100 000 posts instead.
-- Plain CREATE INDEX: Prisma runs a migration in one transaction, where
-- CONCURRENTLY is not allowed (like 20261108170000_channels_search_trgm).
-- The expression must equal the one in postgres-search.provider.ts
-- (POST_TEXT_SQL).
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS posts_text_trgm_idx
  ON public.posts USING GIN ((coalesce(title, '') || ' ' || body) public.gin_trgm_ops)
  WHERE status = 'published' AND deleted_at IS NULL AND archived_at IS NULL;

-- Foreman re-check 25.11 (item 9 #16, ROUND2 #16): the fallback of the Q&A
-- search (PostgresSearchProvider questionsFallbackSql: a typo, a fragment
-- inside a text) had no index for `body ILIKE '%…%'` and read every
-- published question and answer. Trigram GIN indexes (pg_trgm docs, «Index
-- Support»: gin_trgm_ops serves LIKE / ILIKE) on the two bodies, partial on
-- the same predicate the query has, so the fallback reads only matching
-- rows. The title already has legal_questions_title_trgm_idx
-- (20261031200100_legal_qa_fts_indexes). Built CONCURRENTLY (no write
-- block on a live table), one index per statement; partial, so Prisma
-- leaves them out of its schema diff. EXPLAIN check:
-- test/questions-fallback-index.e2e-spec.ts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_questions_body_trgm_idx
  ON legal_questions USING GIN (body public.gin_trgm_ops)
  WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_answers_body_trgm_idx
  ON legal_answers USING GIN (body public.gin_trgm_ops)
  WHERE status = 'published' AND deleted_at IS NULL;

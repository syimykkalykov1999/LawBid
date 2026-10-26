-- BUG-1 follow-up (2026-10-25, package N-12b): the public Q&A search
-- (PostgresSearchProvider.searchQuestions) computed to_tsvector over every
-- published question and answer on each request (a full scan) and OR-ed
-- substring LIKEs on top. Public text, no encryption: PostgreSQL's own
-- full-text index (GIN over the same expression the query uses —
-- docs "Preferred Index Types for Text Search") plus a trigram index on the
-- folded title for the typo / substring arm. The query now reads through
-- these indexes and keeps the old full scan only as a fallback when they
-- find nothing.
--
-- Plain CREATE INDEX IF NOT EXISTS: Prisma runs a migration in one
-- transaction, where CONCURRENTLY is not allowed (same as
-- 20261029100000_hot_path_indexes); the Q&A tables are small at launch.
-- Partial + expression indexes are raw SQL only (Prisma does not model
-- them and ignores them in its diff, like messages_expiry_idx).

CREATE INDEX IF NOT EXISTS legal_questions_fts_idx
  ON public.legal_questions
  USING GIN (to_tsvector('simple'::regconfig, public.f_unaccent(title || ' ' || body)))
  WHERE status = 'published' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS legal_answers_fts_idx
  ON public.legal_answers
  USING GIN (to_tsvector('simple'::regconfig, public.f_unaccent(body)))
  WHERE status = 'published' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS legal_questions_title_trgm_idx
  ON public.legal_questions
  USING GIN (public.f_unaccent(lower(title)) public.gin_trgm_ops)
  WHERE status = 'published' AND deleted_at IS NULL;

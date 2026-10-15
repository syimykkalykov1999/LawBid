-- migration-safety: contract the weighted columns replace the same-named generated columns in one step; search is read-only and old code still works with them (same names, same types)
-- Owner 2026-10-15: search like a search engine.
--  * weights: a word in the title (A) outranks a word in the text (C);
--  * accents are ignored (unaccent, wrapped to be IMMUTABLE for a generated
--    column);
--  * typo-tolerant fallback: trigram GIN on the lower-cased titles.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

ALTER TABLE "cases" DROP COLUMN "search_tsv", DROP COLUMN "search_tsv_simple";
ALTER TABLE "cases"
  ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, public.f_unaccent("title")), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.f_unaccent("description")), 'C')
  ) STORED,
  ADD COLUMN "search_tsv_simple" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, public.f_unaccent("title")), 'A') ||
    setweight(to_tsvector('simple'::regconfig, public.f_unaccent("description")), 'C')
  ) STORED;
CREATE INDEX "cases_search_tsv_idx" ON "cases" USING gin ("search_tsv");
CREATE INDEX "cases_search_tsv_simple_idx" ON "cases" USING gin ("search_tsv_simple");
CREATE INDEX "cases_title_trgm_idx" ON "cases" USING gin (lower("title") public.gin_trgm_ops);

ALTER TABLE "posts" DROP COLUMN "search_tsv", DROP COLUMN "search_tsv_simple";
ALTER TABLE "posts"
  ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, public.f_unaccent(coalesce("title", ''))), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.f_unaccent("body")), 'C')
  ) STORED,
  ADD COLUMN "search_tsv_simple" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple'::regconfig, public.f_unaccent(coalesce("title", ''))), 'A') ||
    setweight(to_tsvector('simple'::regconfig, public.f_unaccent("body")), 'C')
  ) STORED;
CREATE INDEX "posts_search_tsv_idx" ON "posts" USING gin ("search_tsv");
CREATE INDEX "posts_search_tsv_simple_idx" ON "posts" USING gin ("search_tsv_simple");
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING gin (lower("title") public.gin_trgm_ops) WHERE "title" IS NOT NULL;

-- Search takes the newest matches of a word first; without an index on the
-- publication order the planner read all 2M posts for a common word
-- (2.3 s, 480k blocks); with it the same query reads ~1000 rows (7 ms).
CREATE INDEX "posts_published_created_idx" ON "posts" ("created_at" DESC, "id" DESC) WHERE "status" = 'published' AND "deleted_at" IS NULL;

-- Owner 2026-10-13: search finds posts and cases in any language. The
-- 'english' full-text column stems English only; a second computed column
-- with the 'simple' config (no stemming, no stop words) matches the exact
-- words of every language and script (Russian, Nepali, Arabic, ...).
ALTER TABLE "posts" ADD COLUMN "search_tsv_simple" TSVECTOR
  AS (to_tsvector('simple', "body")) STORED;
ALTER TABLE "cases" ADD COLUMN "search_tsv_simple" TSVECTOR
  AS (to_tsvector('simple', "title" || ' ' || "description")) STORED;
CREATE INVERTED INDEX "posts_search_tsv_simple_idx" ON "posts" ("search_tsv_simple");
CREATE INVERTED INDEX "cases_search_tsv_simple_idx" ON "cases" ("search_tsv_simple");

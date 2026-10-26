-- Owner 2026-10-20 (speed): the feed, profiles, search and tags read posts
-- with `status = $1` (Prisma sends the value as a parameter). Postgres
-- cannot match a parameter against the partial indexes that say
-- `WHERE status = 'published'`, so it ignored them and read the whole
-- table: 100 k posts = 46 ms for one page and 300-600 ms under load,
-- growing with every post (measured, EXPLAIN: 0.29 ms with a literal).
-- This index only tests `IS NULL`, which Prisma writes literally, so it
-- always matches; `status` is then a cheap filter on rows already in
-- order. Raw SQL partial index (Prisma ignores WHERE indexes in its diff).
--
-- One statement per migration file and CONCURRENTLY: it builds without
-- blocking writes to posts (a multi-statement file runs in a transaction,
-- where CONCURRENTLY is refused). If a build is interrupted, drop the
-- INVALID index (`\d posts`) and run `prisma migrate resolve` + deploy again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_visible_created_idx
  ON public.posts USING btree (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

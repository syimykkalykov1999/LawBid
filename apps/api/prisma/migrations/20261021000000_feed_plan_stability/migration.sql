-- Owner 2026-10-20 (speed): the feed, profiles, search and tags read posts
-- with `status = $1` (Prisma sends the value as a parameter). Postgres
-- cannot match a parameter against the partial indexes that say
-- `WHERE status = 'published'`, so it ignored them and read the whole
-- table: 100 k posts = 46 ms for one page and 300–600 ms under load,
-- growing with every post (measured, EXPLAIN: 0.29 ms with a literal).
-- These indexes only test `IS NULL`, which Prisma writes literally, so
-- they always match; `status` is then a cheap filter on rows already in
-- order. (Raw SQL partial indexes: Prisma ignores WHERE indexes in its diff.)
CREATE INDEX IF NOT EXISTS posts_visible_created_idx
  ON public.posts USING btree (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_author_visible_idx
  ON public.posts USING btree (author_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

-- A prepared statement is planned with the real values for its first five
-- runs, then Postgres may keep one "generic" plan. For these queries the
-- generic plan reads the whole table (4 s on 100 k posts), so always plan
-- with the real values; planning costs about 1 ms on the heaviest queries.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DATABASE %I SET plan_cache_mode = force_custom_plan',
    current_database());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'plan_cache_mode not set: set it in the RDS parameter group';
END $$;

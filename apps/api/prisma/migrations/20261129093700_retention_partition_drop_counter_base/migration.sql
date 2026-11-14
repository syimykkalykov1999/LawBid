SET LOCAL lock_timeout = '5s';
-- DB scale findings batch B (retention) and C (counters). Expand only: one
-- nullable-free column with a constant default (no table rewrite on
-- PostgreSQL 11+), one small new table and three functions.
--
-- 1. posts.view_count_base: views whose post_view_events rows are gone.
--    Retention deletes events older than storage.retention_post_view_events_days
--    (730); the nightly recount used to set view_count = count(events) and
--    so took those views away from old posts. Retention now adds the views
--    it removes to this column in the same statement, and the recount sets
--    view_count = view_count_base + count(events).
ALTER TABLE "posts" ADD COLUMN "view_count_base" INTEGER NOT NULL DEFAULT 0;

-- 2. counter_flush_batches: one key per counter flush batch applied to this
--    database. The flusher keeps a drained batch in Redis until its UPDATE
--    committed; after a hard kill the next flush applies the batch again
--    with the same key, and the key makes the second apply a no-op. Exists
--    on every physical database (the counted rows can live on any of them).
--    Cleaned by retention (storage.retention_counter_flush_days).
CREATE TABLE "counter_flush_batches" (
    "token" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "counter_flush_batches_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "counter_flush_batches_applied_at_idx" ON "counter_flush_batches"("applied_at");

-- 3. Retention by whole month (idea of pg_partman's retention: drop a child
--    table whose whole range is past the retention, instead of deleting its
--    rows one by one). Drops AT MOST ONE monthly partition per call, so each
--    drop is its own short transaction; the caller loops until NULL.
--    A partition is dropped only when
--      * the table is natively partitioned and no online conversion of it is
--        in progress or waiting for «Завершить» / «Отменить» (_partition_job
--        phase other than done / aborted): an undo would bring the rows back;
--      * its UPPER bound (read from the catalog, not from the name) is at or
--        before p_before, i.e. every row in it is past the retention the row
--        delete uses — nothing newer can be in it;
--      * no row in it belongs to a person under a legal hold (p_held): such a
--        month stays, and the row delete keeps removing the others in it;
--      * p_before is at least one day in the past (a guard against a bad
--        caller; a retention of 0 days means «keep forever» and never calls).
--    post_view_events: the month's 'view' rows are added to
--    posts.view_count_base first, in the same transaction as the drop.
--    lock_timeout (p_lock_timeout_ms): DROP of a partition takes an ACCESS
--    EXCLUSIVE lock on the parent for a moment; a busy table makes the call
--    fail fast and the next night tries again.
CREATE OR REPLACE FUNCTION lawbid_drop_expired_month_partition(
  p_table text,
  p_before timestamptz,
  p_held uuid[],
  p_lock_timeout_ms integer
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  r record;
  v_col text;
  v_held boolean;
BEGIN
  IF p_table = 'post_view_events' THEN
    v_col := 'viewer_id';
  ELSIF p_table = 'auth_events' THEN
    v_col := 'user_id';
  ELSE
    RAISE EXCEPTION 'table % has no month retention', p_table;
  END IF;
  IF p_before IS NULL OR p_before > now() - interval '1 day' THEN
    RAISE EXCEPTION 'retention cut-off % refused: must be at least a day ago', p_before;
  END IF;
  IF (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', p_table))) IS DISTINCT FROM 'p' THEN
    RETURN NULL;
  END IF;
  IF to_regclass('public._partition_job') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public._partition_job WHERE tbl = $1 AND phase NOT IN (''done'', ''aborted''))'
      INTO v_held USING p_table;
    IF v_held THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM set_config('lock_timeout', GREATEST(COALESCE(p_lock_timeout_ms, 5000), 1)::text || 'ms', true);
  FOR r IN
    SELECT c.relname AS name
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = to_regclass(format('public.%I', p_table))
       AND c.relname ~ ('^' || p_table || '_p[0-9]{4}_[0-9]{2}$')
       AND substring(pg_get_expr(c.relpartbound, c.oid) FROM 'TO \(''([^'']+)''\)')::timestamptz <= p_before
     ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = ANY($1))', r.name, v_col)
      INTO v_held USING COALESCE(p_held, '{}'::uuid[]);
    CONTINUE WHEN v_held;
    IF p_table = 'post_view_events' THEN
      EXECUTE format(
        'UPDATE public.posts AS p SET view_count_base = p.view_count_base + v.n
           FROM (SELECT post_id, count(*)::int AS n FROM public.%I
                  WHERE kind = ''view'' GROUP BY post_id) AS v
          WHERE p.id = v.post_id', r.name);
    END IF;
    EXECUTE format('DROP TABLE public.%I', r.name);
    RETURN r.name;
  END LOOP;
  RETURN NULL;
END
$fn$;

-- The application role may drop expired months of post_view_events only;
-- auth_events (append-only for the application) only through the retention
-- role, which may already delete its old rows.
CREATE OR REPLACE FUNCTION lawbid_drop_expired_post_view_events_month(
  p_before timestamptz,
  p_held uuid[],
  p_lock_timeout_ms integer
) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT lawbid_drop_expired_month_partition('post_view_events', p_before, p_held, p_lock_timeout_ms)
$fn$;

CREATE OR REPLACE FUNCTION lawbid_drop_expired_auth_events_month(
  p_before timestamptz,
  p_held uuid[],
  p_lock_timeout_ms integer
) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT lawbid_drop_expired_month_partition('auth_events', p_before, p_held, p_lock_timeout_ms)
$fn$;

REVOKE ALL ON FUNCTION lawbid_drop_expired_month_partition(text, timestamptz, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION lawbid_drop_expired_post_view_events_month(timestamptz, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION lawbid_drop_expired_auth_events_month(timestamptz, uuid[], integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_app') THEN
    GRANT EXECUTE ON FUNCTION lawbid_drop_expired_post_view_events_month(timestamptz, uuid[], integer) TO lawbid_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_retention') THEN
    GRANT EXECUTE ON FUNCTION lawbid_drop_expired_auth_events_month(timestamptz, uuid[], integer) TO lawbid_retention;
  END IF;
END $$;

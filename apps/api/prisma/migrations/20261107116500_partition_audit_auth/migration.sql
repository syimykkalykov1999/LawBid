-- Owner 2026-10-24: monthly partitioning of the append-heavy tables
-- audit_log and auth_events (docs/architecture/TABLE_PARTITIONING_READY.md).
--
-- EXPAND ONLY (perf review 2026-10-26, R-20): this migration converts
-- NOTHING. It never locks, copies or rewrites a table, so `prisma migrate
-- deploy` cannot block on a busy table or fail on a big one. It only adds the
-- two upkeep functions below. The conversion itself is done by the ONLINE
-- RUNNER (src/partitioning/partition-runner.ts), and only when an admin
-- starts it («Масштаб» -> card -> «Запустить», one 2FA code): shadow table,
-- copy trigger, batched backfill, verify, a short swap with lock_timeout,
-- undo for 7 days. That opt-in runner is the ONLY path that partitions a
-- table; the Prisma schema keeps `@id id` (the runner widens the key to
-- (id, created_at) in the database, like for data_access_log).
--
-- Future months are created by the daily job `partition.maintain`
-- (lawbid_ensure_month_partitions; it returns 0 for a plain table); rows
-- outside every partition fall into the DEFAULT partition, so a late job
-- never loses or rejects a row.

-- Creates the missing monthly partitions from this month to N months ahead.
-- SECURITY DEFINER: the application role cannot create tables itself.
CREATE OR REPLACE FUNCTION lawbid_ensure_month_partitions(
  p_table text,
  p_months_ahead integer DEFAULT 2
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_m date := date_trunc('month', now())::date;
  v_last date := (date_trunc('month', now()) + make_interval(months => p_months_ahead))::date;
  v_created integer := 0;
  v_name text;
BEGIN
  IF p_table NOT IN ('audit_log', 'auth_events', 'data_access_log') THEN
    RAISE EXCEPTION 'table % is not on the partition list', p_table;
  END IF;
  IF (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', p_table))) IS DISTINCT FROM 'p' THEN
    RETURN 0;
  END IF;
  WHILE v_m <= v_last LOOP
    v_name := p_table || '_p' || to_char(v_m, 'YYYY_MM');
    IF to_regclass(format('public.%I', v_name)) IS NULL THEN
      BEGIN
        EXECUTE format(
          'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
          v_name, p_table, v_m::timestamptz, (v_m + interval '1 month')::timestamptz);
        v_created := v_created + 1;
      EXCEPTION WHEN check_violation THEN
        -- Rows of that month already sit in the DEFAULT partition.
        RAISE WARNING 'partition % not created: rows of that month are in the default partition', v_name;
      END;
    END IF;
    v_m := (v_m + interval '1 month')::date;
  END LOOP;
  RETURN v_created;
END
$fn$;

-- Optional retention: detaches (does not drop) partitions whose whole month is
-- older than p_keep_months. Nothing calls it unless a retention is configured
-- for the table in src/partitioning/partition-maintenance.ts (none is today).
CREATE OR REPLACE FUNCTION lawbid_detach_old_partitions(
  p_table text,
  p_keep_months integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  r record;
  v_cut timestamptz := date_trunc('month', now()) - make_interval(months => p_keep_months);
  v_n integer := 0;
BEGIN
  IF p_table NOT IN ('audit_log', 'auth_events', 'data_access_log') THEN
    RAISE EXCEPTION 'table % is not on the partition list', p_table;
  END IF;
  FOR r IN
    SELECT c.relname AS name
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = to_regclass(format('public.%I', p_table))
       AND c.relname ~ ('^' || p_table || '_p[0-9]{4}_[0-9]{2}$')
       AND to_date(right(c.relname, 7), 'YYYY_MM') + interval '1 month' <= v_cut
  LOOP
    EXECUTE format('ALTER TABLE public.%I DETACH PARTITION public.%I', p_table, r.name);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_app') THEN
    REVOKE ALL ON FUNCTION lawbid_ensure_month_partitions(text, integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION lawbid_detach_old_partitions(text, integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION lawbid_ensure_month_partitions(text, integer) TO lawbid_app;
    GRANT EXECUTE ON FUNCTION lawbid_detach_old_partitions(text, integer) TO lawbid_app;
  END IF;
END $$;

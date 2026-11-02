-- post_view_events joins the monthly-partitioning list (expand only: nothing is
-- converted here). The online runner converts it only when an admin starts it
-- («Масштаб» -> card -> «Запустить»); the daily job keeps the future months
-- once it is partitioned (the function returns 0 for a plain table). Dropping
-- or detaching old months is NOT enabled for this table: retention keeps
-- deleting rows in batches because it must respect legal holds
-- (data-retention.service.ts). Idempotent (CREATE OR REPLACE).

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
  IF p_table NOT IN ('audit_log', 'auth_events', 'data_access_log', 'post_view_events') THEN
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

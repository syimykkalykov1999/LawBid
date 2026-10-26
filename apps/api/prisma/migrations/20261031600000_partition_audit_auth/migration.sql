-- migration-safety: contract audit_log/auth_events are swapped for partitioned twins inside one transaction; the table names and columns stay the same, only the key gains created_at, so old and new code both work and nothing reads these rows by id alone
-- Owner 2026-10-24: partition the append-heavy tables by month NOW, while they
-- are tiny (docs/architecture/TABLE_PARTITIONING_READY.md). Native declarative
-- RANGE partitioning on the created_at column; the partition key joins the
-- primary key (PostgreSQL requires it), so the key is (id, created_at).
--
-- Tables: audit_log, auth_events. Each has no foreign key
-- pointing AT it, no unique index other than the primary key, and is only
-- read through indexes that start with created_at or a filter column. The
-- other big candidates stay as they are, with the reason in the doc:
--   messages       6 foreign keys point at messages(id) and a unique index
--                  (conversation_id, sender_id, client_message_id) protects
--                  against duplicate sends: neither can include created_at.
--   notifications  partial unique index (user_id, dedupe_key): same problem.
--   search_query_log  nothing blocks it in the database, but a third composite
--                  primary key in schema.prisma pushes the Prisma client types
--                  over TypeScript's instantiation limit (TS2589 in
--                  prisma.service.ts `extend`); revisit after that typing is
--                  simplified.
--
-- Safety on production:
--   * a table is converted only when it holds at most 2 million rows (it is
--     tiny today); a bigger one RAISES and the migration stops BEFORE any
--     change - use the online runner (src/partitioning) instead;
--   * lock_timeout 5 s on the swap, the whole conversion of a tiny table is
--     milliseconds; a failure rolls the whole migration back;
--   * idempotent: an already partitioned table is skipped.
-- Future months are created by the daily job `partition-maintain`
-- (lawbid_ensure_month_partitions); rows outside every partition fall into
-- the DEFAULT partition, so a late job never loses or rejects a row.

CREATE OR REPLACE FUNCTION lawbid_partition_table_by_month(
  p_table text,
  p_key text,
  p_max_rows bigint DEFAULT 2000000
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_old text := p_table || '__old';
  v_rows bigint;
  v_first date;
  v_last date;
  v_cols text;
  v_m date;
  r record;
BEGIN
  IF (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(format('public.%I', p_table))) = 'p' THEN
    RETURN; -- already partitioned
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_rows;
  IF v_rows > p_max_rows THEN
    RAISE EXCEPTION '% has % rows (limit %): use the online runner, not a migration', p_table, v_rows, p_max_rows;
  END IF;

  SET LOCAL lock_timeout = '5s';
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', p_table);

  -- Definitions to replay on the new table (captured before the rename).
  CREATE TEMP TABLE _pt_idx ON COMMIT DROP AS
    SELECT pg_get_indexdef(x.indexrelid) AS def
      FROM pg_index x
     WHERE x.indrelid = to_regclass(format('public.%I', p_table)) AND NOT x.indisprimary;
  CREATE TEMP TABLE _pt_fk ON COMMIT DROP AS
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = to_regclass(format('public.%I', p_table)) AND contype = 'f';
  CREATE TEMP TABLE _pt_acl ON COMMIT DROP AS
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END AS grantee,
           a.privilege_type AS priv
      FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.oid = to_regclass(format('public.%I', p_table)) AND a.grantee <> c.relowner;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass(format('public.%I', p_table))
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

  EXECUTE format('SELECT date_trunc(''month'', COALESCE(min(%I), now()))::date FROM public.%I', p_key, p_table) INTO v_first;
  v_last := (date_trunc('month', now()) + interval '2 months')::date;

  -- The old table steps aside, with all its index / constraint names.
  EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_table, v_old);
  FOR r IN
    SELECT c.relname AS name, 'i' AS kind
      FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
     WHERE x.indrelid = to_regclass(format('public.%I', v_old)) AND NOT x.indisprimary
    UNION ALL
    SELECT conname, 'c' FROM pg_constraint
     WHERE conrelid = to_regclass(format('public.%I', v_old)) AND contype IN ('f', 'p')
  LOOP
    IF r.kind = 'i' THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.name, left(r.name, 55) || '__old');
    ELSE
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', v_old, r.name, left(r.name, 55) || '__old');
    END IF;
  END LOOP;

  EXECUTE format(
    'CREATE TABLE public.%I (LIKE public.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING STORAGE INCLUDING COMMENTS) PARTITION BY RANGE (%I)',
    p_table, v_old, p_key);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id, %I)', p_table, p_table || '_pkey', p_key);
  EXECUTE format('CREATE TABLE public.%I PARTITION OF public.%I DEFAULT', p_table || '_default', p_table);
  v_m := v_first;
  WHILE v_m <= v_last LOOP
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
      p_table || '_p' || to_char(v_m, 'YYYY_MM'), p_table,
      v_m::timestamptz, (v_m + interval '1 month')::timestamptz);
    v_m := (v_m + interval '1 month')::date;
  END LOOP;

  FOR r IN SELECT def FROM _pt_idx LOOP
    EXECUTE r.def;
  END LOOP;
  FOR r IN SELECT conname, def FROM _pt_fk LOOP
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', p_table, r.conname, r.def);
  END LOOP;

  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM public.%I ORDER BY %I',
                 p_table, v_cols, v_cols, v_old, p_key);

  -- A serial column keeps its counter: the sequence now belongs to the new table.
  FOR r IN
    SELECT a.attname AS col, pg_get_serial_sequence(format('public.%I', v_old), a.attname) AS seq
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass(format('public.%I', v_old)) AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF r.seq IS NOT NULL THEN
      EXECUTE format('ALTER SEQUENCE %s OWNED BY public.%I.%I', r.seq, p_table, r.col);
    END IF;
  END LOOP;

  -- Privileges: exactly those of the old table (default privileges may have
  -- granted more, e.g. UPDATE / DELETE on an append-only table).
  FOR r IN
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END AS grantee
      FROM pg_class c, aclexplode(c.relacl) a
     WHERE c.oid = to_regclass(format('public.%I', p_table)) AND a.grantee <> c.relowner
     GROUP BY a.grantee
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM %s', p_table, r.grantee);
  END LOOP;
  FOR r IN SELECT grantee, priv FROM _pt_acl LOOP
    EXECUTE format('GRANT %s ON public.%I TO %s', r.priv, p_table, r.grantee);
  END LOOP;

  EXECUTE format('DROP TABLE public.%I', v_old);
  DROP TABLE _pt_idx;
  DROP TABLE _pt_fk;
  DROP TABLE _pt_acl;
END
$fn$;

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
  IF p_table NOT IN ('audit_log', 'auth_events') THEN
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
  IF p_table NOT IN ('audit_log', 'auth_events') THEN
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
    REVOKE ALL ON FUNCTION lawbid_partition_table_by_month(text, text, bigint) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION lawbid_ensure_month_partitions(text, integer) TO lawbid_app;
    GRANT EXECUTE ON FUNCTION lawbid_detach_old_partitions(text, integer) TO lawbid_app;
  END IF;
END $$;

SELECT lawbid_partition_table_by_month('audit_log', 'created_at');
SELECT lawbid_partition_table_by_month('auth_events', 'created_at');

-- DB-ops hardening S5-1: per-table autovacuum for the tables that grow and
-- lose rows fastest. The instance default (parameter group,
-- autovacuum_vacuum_scale_factor 0.05) is still far too lazy for a table of
-- hundreds of millions of rows: 5 % = tens of millions of dead tuples before
-- the first vacuum, and every index scan walks them. Here a vacuum starts
-- after 1 % dead rows (and 1 % new rows for the insert-only tables, so the
-- visibility map stays fresh for index-only scans), may spend 10x the default
-- I/O budget (cost limit 2000) and stalls less (cost delay 2 ms).
--
-- Storage parameters only: no rewrite, no data change, takes a brief
-- SHARE UPDATE EXCLUSIVE lock. Expand-only and harmless to the previous
-- release. A table that does not exist (or became partitioned, where
-- autovacuum options cannot be set on the parent) is skipped.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages',
    'notifications',
    'sessions',
    'post_view_events',
    'cross_family_outbox',
    'cross_family_inbox',
    'search_outbox'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I SET (autovacuum_vacuum_scale_factor = 0.01, '
        'autovacuum_analyze_scale_factor = 0.01, '
        'autovacuum_vacuum_insert_scale_factor = 0.01, '
        'autovacuum_vacuum_cost_limit = 2000, '
        'autovacuum_vacuum_cost_delay = 2)',
        t
      );
    END IF;
  END LOOP;
END
$$;

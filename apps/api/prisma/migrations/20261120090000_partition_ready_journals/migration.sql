SET LOCAL lock_timeout = '5s';
-- Automation audit 2026-11-08 (docs/dev/AUTOMATION_AUDIT_2026-11-08.md):
-- admin «Масштаб» showed «Пока нельзя» for the three monthly journals,
-- because the online partition runner's precheck
-- (partitioning/partition-runner.ts precheck) refuses
--   * audit_log:       unique index without created_at (audit_log_seq_key);
--   * auth_events:     no index that starts with created_at (batched copy);
--   * data_access_log: no index that starts with accessed_at.
-- After this migration each journal can be converted by month online.
--
-- audit_log.seq is handed out by the audit_log_chain trigger under the row
-- lock of the one-row audit_log_chain_head, so two rows never get the same
-- seq; the unique index is a second guard. A partitioned table can only
-- enforce uniqueness together with the partition key, so the guard becomes
-- (seq, created_at): same NULL rules, and seq lookups use it (seq first).
-- Built before the old one is dropped, inside one transaction: no moment
-- without a guard.
--
-- Plain CREATE INDEX (Prisma runs a migration in one transaction, where
-- CONCURRENTLY is not allowed), like 20261108170000_channels_search_trgm:
-- the three journals are small at launch (a short SHARE lock on writes).
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX IF NOT EXISTS "audit_log_seq_created_at_key"
  ON "audit_log" ("seq", "created_at");
-- squawk-ignore require-concurrent-index-deletion
DROP INDEX IF EXISTS "audit_log_seq_key";
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS "auth_events_created_at_id_idx"
  ON "auth_events" ("created_at", "id");
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS "data_access_log_accessed_at_id_idx"
  ON "data_access_log" ("accessed_at", "id");

-- post_view_events has a «Выкл / Вкл / Авто» switch (partition.post_view_events_mode),
-- but 20261112110000 gave the runner's tables role only the three hash tables,
-- so «Авто» could never convert it (the runner must own the table). Same
-- least-privilege pattern: owned by lawbid_partition_tables (lawbid_migrator is
-- a member, later migrations still alter it). Nothing references the table.
-- The security journals (audit_log, auth_events, data_access_log) stay with the
-- migrator on purpose: the owner of audit_log could disable its hash chain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_partition_tables')
     AND to_regclass('public.post_view_events') IS NOT NULL
     AND (SELECT pg_get_userbyid(c.relowner) FROM pg_class c
           WHERE c.oid = to_regclass('public.post_view_events')) <> 'lawbid_partition_tables' THEN
    BEGIN
      ALTER TABLE public.post_view_events OWNER TO lawbid_partition_tables;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'post_view_events owner not changed (no rights); see docs/runbooks/table-partitioning.md';
    END;
  END IF;
END $$;

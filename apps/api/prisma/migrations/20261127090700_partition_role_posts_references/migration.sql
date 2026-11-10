-- 2026-11-10 (rehearsal of «Авто» partitioning on a copy of the database at
-- partition.auto_rows = 30): messages, chat_group_messages and notifications
-- converted by themselves, post_view_events failed in «prepare» with
-- `permission denied for table posts`. Its foreign key points at posts, and
-- posts was missing from the tables the partition role may reference
-- (20261112110000_partition_role_least_privilege, `parents`). Same grant,
-- same guards; REFERENCES only (no reading or writing posts).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_partition_tables')
     AND to_regclass('public.posts') IS NOT NULL THEN
    SET LOCAL lock_timeout = '5s';
    BEGIN
      GRANT REFERENCES ON public.posts TO lawbid_partition_tables;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'REFERENCES on posts not granted (no rights); see docs/runbooks/table-partitioning.md';
    END;
  END IF;
END $$;

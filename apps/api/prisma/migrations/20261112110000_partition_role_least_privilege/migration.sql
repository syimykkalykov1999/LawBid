-- Least privilege for the online table partitioning role (follow-up to
-- 20261112100000_partition_role, which linked lawbid_partition to the
-- migrator: a worker compromise would then reach every table, including the
-- append-only ones).
--
-- Now lawbid_partition is a plain role that OWNS only the three tables the
-- runner converts (messages, chat_group_messages, notifications) and the
-- tables that reference them (their foreign keys are re-pointed in the swap),
-- may use schema public, and may REFERENCE the parents of the new tables.
-- It owns and has NO rights on audit_log, case_journal, auth_events,
-- user_consents, users and the rest. The tables belong to a NOLOGIN role
-- lawbid_partition_tables; lawbid_partition (login of the worker, sessions run
-- AS that role) and the migrator are both MEMBERS of it, so later Prisma
-- migrations can still alter those tables. No membership cycle between the
-- login and the migrator: the previous migration can be replayed on another
-- database of the same cluster (shard databases, the two-database e2e)
-- without GRANT errors, and this migration then narrows the role again.
-- Idempotent. A managed service whose migration user
-- may not create roles or change owners only gets a notice.
DO $$
DECLARE
  t text;
  owned text[] := ARRAY[
    'messages', 'chat_group_messages', 'notifications',
    'message_hidden', 'message_reactions', 'message_edits', 'message_pins',
    'saved_chat_messages', 'chat_group_polls'];
  parents text[] := ARRAY[
    'conversations', 'files', 'stickers', 'users', 'gift_sends',
    'chat_groups', 'chat_group_topics'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_partition') THEN
    CREATE ROLE lawbid_partition WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_partition_tables') THEN
    CREATE ROLE lawbid_partition_tables NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;

  -- Undo the broad link of the previous migration (each step on its own, so a
  -- refused one does not undo the others).
  BEGIN
    -- Objects the runner creates are owned by the tables role, not the login.
    ALTER ROLE lawbid_partition SET role = 'lawbid_partition_tables';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'lawbid_partition: SET role refused (do it by hand)';
  END;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_migrator') THEN
    BEGIN
      IF pg_has_role('lawbid_partition', 'lawbid_migrator', 'member') THEN
        REVOKE lawbid_migrator FROM lawbid_partition;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'lawbid_partition still linked to lawbid_migrator (REVOKE by hand)';
    END;
    BEGIN
      -- PostgreSQL 16: the own grant of the creator carries ADMIN only (no SET, no
      -- INHERIT); both members need both to change owners and to alter tables.
      IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
         WHERE m.roleid = 'lawbid_partition_tables'::regrole
           AND m.member = 'lawbid_migrator'::regrole
           AND m.set_option AND m.inherit_option) THEN
        GRANT lawbid_partition_tables TO lawbid_migrator WITH SET TRUE, INHERIT TRUE;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'lawbid_migrator is not a member of lawbid_partition_tables (GRANT by hand)';
    END;
  END IF;
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_auth_members m
       WHERE m.roleid = 'lawbid_partition_tables'::regrole
         AND m.member = 'lawbid_partition'::regrole
         AND m.set_option AND m.inherit_option) THEN
      GRANT lawbid_partition_tables TO lawbid_partition WITH SET TRUE, INHERIT TRUE;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'lawbid_partition is not a member of lawbid_partition_tables (GRANT by hand)';
  END;

  SET LOCAL lock_timeout = '5s';
  BEGIN
    EXECUTE 'GRANT USAGE, CREATE ON SCHEMA public TO lawbid_partition_tables';
    FOREACH t IN ARRAY owned LOOP
      IF to_regclass(format('public.%I', t)) IS NOT NULL
         AND (SELECT pg_get_userbyid(c.relowner) FROM pg_class c
               WHERE c.oid = to_regclass(format('public.%I', t))) <> 'lawbid_partition_tables' THEN
        EXECUTE format('ALTER TABLE public.%I OWNER TO lawbid_partition_tables', t);
      END IF;
    END LOOP;
    FOREACH t IN ARRAY parents LOOP
      IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
        EXECUTE format('GRANT REFERENCES ON public.%I TO lawbid_partition_tables', t);
      END IF;
    END LOOP;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'lawbid_partition ownership not set (no rights to change owners); see docs/runbooks/table-partitioning.md';
  END;

  ALTER ROLE lawbid_partition SET statement_timeout = '0';
  ALTER ROLE lawbid_partition SET lock_timeout = '5s';
  ALTER ROLE lawbid_partition SET idle_in_transaction_session_timeout = '10min';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'lawbid_partition not configured (no CREATEROLE); see docs/runbooks/table-partitioning.md';
END $$;

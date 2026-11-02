-- Role for the online table partitioning (messages, chat_group_messages,
-- notifications: docs/runbooks/table-partitioning.md). Idempotent. No password
-- here: scripts/deploy/prod-db-setup.sh sets it and writes the connection
-- string to Secrets Manager (PARTITION_DATABASE_URL), and Terraform hands that
-- secret to the WORKER only (partition_role_enabled), never to the api.
--
-- The runner converts a table and re-points the foreign keys of the tables
-- that reference it, so it needs the DDL rights of the table owner
-- (lawbid_migrator). Membership gives exactly those and nothing more: no
-- superuser, no CREATEROLE, no CREATEDB, no bypass of row security, and it can
-- be revoked with one statement without touching table ownership (so later
-- migrations keep working). Narrowing it to ownership of only the tables that
-- are converted is a follow-up that needs a rehearsal on a database copy.
-- A managed service whose migration user may not create roles only gets a
-- notice (as in the baseline).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_partition') THEN
    CREATE ROLE lawbid_partition WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_migrator') THEN
    BEGIN
      GRANT lawbid_migrator TO lawbid_partition;
      -- Every session of this login runs AS lawbid_migrator, so the tables the
      -- runner creates are owned by the migrator, not by lawbid_partition
      -- (otherwise later Prisma migrations could not ALTER them).
      ALTER ROLE lawbid_partition SET role = 'lawbid_migrator';
    EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
      RAISE NOTICE 'lawbid_partition not linked to lawbid_migrator (grant it by hand)';
    END;
  END IF;
  ALTER ROLE lawbid_partition SET statement_timeout = '0';
  ALTER ROLE lawbid_partition SET lock_timeout = '5s';
  ALTER ROLE lawbid_partition SET idle_in_transaction_session_timeout = '10min';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'lawbid_partition not created (no CREATEROLE); see docs/runbooks/table-partitioning.md';
END $$;

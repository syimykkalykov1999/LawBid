-- DB-ops hardening S5-2: the migration role had no timeouts at all, so one
-- `ALTER TABLE` queued behind a long query froze every query on that table
-- (the lock queue) until someone noticed. From the NEXT session on the
-- migrator waits at most 5 s for a lock (the deploy retries once on
-- SQLSTATE 55P03, scripts/deploy/run-migrations.sh) and no single statement
-- runs longer than 10 minutes (a big backfill belongs in batches).
-- Same shape as the baseline: skipped where the roles do not exist or this
-- connection may not change them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lawbid_migrator') THEN
    ALTER ROLE lawbid_migrator SET lock_timeout = '5s';
    ALTER ROLE lawbid_migrator SET statement_timeout = '10min';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'lawbid_migrator timeouts not set (insufficient privilege)';
END
$$;

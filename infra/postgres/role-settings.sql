-- Zero maintenance (owner 2026-10-05): limits on the database side, so one
-- runaway query or a forgotten open transaction can never hold the
-- database for everybody. Run once after the roles of docs/02 §6.3 exist
-- (the provider's SQL console, or `psql "$ADMIN_URL" -v ON_ERROR_STOP=1
-- -f infra/postgres/role-settings.sql`); re-running is harmless.
-- The app retries serialization conflicts itself (src/prisma/tx-retry.util.ts)
-- and holds at most DB_POOL_SIZE connections per task (src/prisma/prisma.service.ts).

-- The app: requests must finish quickly.
ALTER ROLE lawbid_app SET statement_timeout = '30s';
ALTER ROLE lawbid_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE lawbid_app SET lock_timeout = '10s';

-- Nightly retention sweeps: longer, still bounded.
ALTER ROLE lawbid_retention SET statement_timeout = '10min';
ALTER ROLE lawbid_retention SET idle_in_transaction_session_timeout = '5min';

-- Read-only reporting: never blocks the app for long.
ALTER ROLE lawbid_readonly SET statement_timeout = '2min';
ALTER ROLE lawbid_readonly SET default_transaction_read_only = 'on';

-- Migrations (lawbid_migrator): never wait long for a lock (a queued
-- ALTER TABLE blocks every query behind it; the deploy retries once on
-- SQLSTATE 55P03, scripts/deploy/run-migrations.sh) and no statement runs
-- longer than 10 minutes. Also set by migration 20261101310000.
-- Migrations are expand/contract
-- only (docs/02 §7.1, checked in CI by apps/api/scripts/check-migrations.mjs).
ALTER ROLE lawbid_migrator SET lock_timeout = '5s';
ALTER ROLE lawbid_migrator SET statement_timeout = '10min';

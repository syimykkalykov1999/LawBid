-- Online DDL (owner 2026-10-25, docs/architecture/ONLINE_DDL.md). Two new,
-- empty tables, nothing else is touched.
--
-- concurrent_migrations: which prisma/concurrent/*.sql files (index builds
-- that cannot run inside the migration transaction) have been applied; the
-- runner prisma/run-concurrent.mjs reads and writes it.
CREATE TABLE "concurrent_migrations" (
  "name"       TEXT PRIMARY KEY,
  "checksum"   TEXT NOT NULL,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- backfill_runs: state of the batched data backfills
-- (src/common/backfill, run by src/cli/backfill-runner.ts). One row per named
-- backfill: where it stopped (cursor = last finished key), how many rows it
-- touched, whether an admin paused it. Safe to re-run: every batch is an
-- idempotent UPDATE guarded by "not yet done".
CREATE TABLE "backfill_runs" (
  "name"             TEXT PRIMARY KEY,
  "status"           TEXT NOT NULL DEFAULT 'running',
  "table_name"       TEXT NOT NULL,
  "cursor"           TEXT,
  "processed"        BIGINT NOT NULL DEFAULT 0,
  "total_estimate"   BIGINT,
  "batch_size"       INTEGER NOT NULL,
  "max_rows_per_sec" INTEGER NOT NULL,
  "pause_reason"     TEXT,
  "last_error"       TEXT,
  "started_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "heartbeat_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finished_at"      TIMESTAMPTZ,
  CONSTRAINT "backfill_runs_status_check"
    CHECK ("status" IN ('running', 'paused', 'aborted', 'done', 'failed'))
);

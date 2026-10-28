-- Algo audit 2026-10-27 (CASES C-1 / M-2): a case may alert attorneys more
-- than once (practice or states changed, back from a pause / the archive).
-- The alert dedupe key and the queue job id carry this generation, so the
-- second round is not swallowed by the rows and the stored job of the first.
-- Generation 0 keeps the old key `case_fanout:<id>` (rows written before
-- this column still count as "already alerted").
-- docs/architecture/ONLINE_DDL.md: never queue behind a long query.
SET LOCAL lock_timeout = '5s';
-- A constant default: PostgreSQL 11+ does not rewrite the table.
ALTER TABLE "cases" ADD COLUMN "alert_generation" INTEGER NOT NULL DEFAULT 0;

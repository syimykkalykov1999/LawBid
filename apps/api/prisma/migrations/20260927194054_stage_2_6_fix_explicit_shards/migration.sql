-- Fix for stage 2.6 (docs/02_DATABASE.md §1.1 / §5.2): replace the three
-- `USING HASH` indexes with an explicit STORED shard column + a plain index.
-- Prisma's schema engine panics while introspecting hash-sharded indexes
-- (sql-schema-describer unwrap on the hidden shard column) and the CLI then
-- reports "no drift" with exit code 0 — so `prisma migrate diff`, the CI drift
-- check and every future migration diff were silently broken. The explicit
-- column spreads writes over 16 ranges exactly like hash sharding does.
-- Dropping a hash-sharded index also drops its hidden shard column.
DROP INDEX IF EXISTS "posts"@"posts_global_feed_idx";
DROP INDEX IF EXISTS "auth_events"@"auth_events_created_at_idx";
DROP INDEX IF EXISTS "audit_log"@"audit_log_created_at_idx";

ALTER TABLE "posts" ADD COLUMN "created_shard" INT2 NOT NULL
  AS (mod(fnv32(id::STRING), 16)::INT2) STORED;
ALTER TABLE "auth_events" ADD COLUMN "created_shard" INT2 NOT NULL
  AS (mod(fnv32(id::STRING), 16)::INT2) STORED;
ALTER TABLE "audit_log" ADD COLUMN "created_shard" INT2 NOT NULL
  AS (mod(fnv32(id::STRING), 16)::INT2) STORED;

-- Global feed: read as 16 limited per-shard scans merged by created_at
-- (UNION ALL of `WHERE created_shard = k ORDER BY created_at DESC LIMIT n`).
CREATE INDEX "posts_global_feed_idx" ON "posts" ("created_shard", "created_at" DESC)
  WHERE "status" = 'published';
CREATE INDEX "auth_events_created_at_idx" ON "auth_events" ("created_shard", "created_at");
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" ("created_shard", "created_at");

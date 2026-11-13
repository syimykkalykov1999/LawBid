-- Row 78 (load test 13.11, 10M users + 1B messages, /data/lt/results/rows78-80):
-- the admin overview's «messages in the last 7 days» was COUNT(*) over the
-- messages table (no created_at index: a Parallel Index Only Scan over ~354M
-- index entries, > 30 s = the app role's statement_timeout), so GET
-- /admin/overview and its nightly snapshot answered 500 every time; the two
-- «users by role» counts were a 10M-row seq scan each (0.6 s idle, 12 s
-- under load).
--
-- Fix, the counter-table pattern of the PostgreSQL wiki «Slow counting»
-- (https://wiki.postgresql.org/wiki/Slow_Counting): exact counts kept by
-- triggers in the same transaction as the write, so a rolled-back write
-- rolls its count back too. Read = a sum over a few hundred rows.
--  * metric 'messages': live messages (deleted_at IS NULL, the same rows the
--    Prisma soft-delete filter counts) per UTC hour of created_at;
--  * metric 'users.live.<role>': users with deleted_at IS NULL, by role
--    (bucket = epoch).
-- `slot` = backend pid % 64: concurrent transactions on different
-- connections update different rows (no hot row, the «sharded counter»
-- pattern), the reader sums the slots.
-- The table exists on every physical database (messages may live on a shard
-- database); the overview sums all of them (forEachDatabase).
SET LOCAL lock_timeout = '5s';

CREATE TABLE "stat_counters" (
    "metric" VARCHAR(64) NOT NULL,
    "bucket" TIMESTAMPTZ(6) NOT NULL,
    "slot" SMALLINT NOT NULL,
    "n" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "stat_counters_pkey" PRIMARY KEY ("metric","bucket","slot")
);

-- Adds [delta] to one counter row of this connection's slot.
CREATE FUNCTION stat_counter_add(p_metric text, p_bucket timestamptz, p_delta bigint)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO "stat_counters" ("metric", "bucket", "slot", "n")
  VALUES (p_metric, p_bucket, (pg_backend_pid() % 64)::smallint, p_delta)
  ON CONFLICT ("metric", "bucket", "slot")
  DO UPDATE SET "n" = "stat_counters"."n" + EXCLUDED."n"
$$;

-- messages: INSERT / DELETE statements (one upsert per hour touched, also
-- for a bulk insert or a cascade delete), TRUNCATE, and the rare UPDATE that
-- soft-deletes / restores a message or moves its created_at.
-- Only the live table counts: during an online partition conversion
-- (src/partitioning/partition-runner.ts) the swap copies these triggers to
-- the new table and the old one (renamed) keeps receiving copies of every
-- write through the reverse-sync trigger; counting there would count twice.
-- On a partitioned table a ROW trigger fires with the partition's name, so
-- a partition of the live table counts too (pg_partition_root).
CREATE FUNCTION stat_count_messages_stmt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME <> 'messages'
     AND pg_partition_root(TG_RELID) IS DISTINCT FROM to_regclass('public.messages') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "stat_counters" ("metric", "bucket", "slot", "n")
    SELECT 'messages', date_trunc('hour', r."created_at", 'UTC'),
           (pg_backend_pid() % 64)::smallint, count(*)
      FROM stat_new_rows r
     WHERE r."deleted_at" IS NULL
     GROUP BY 2
    ON CONFLICT ("metric", "bucket", "slot")
    DO UPDATE SET "n" = "stat_counters"."n" + EXCLUDED."n";
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO "stat_counters" ("metric", "bucket", "slot", "n")
    SELECT 'messages', date_trunc('hour', r."created_at", 'UTC'),
           (pg_backend_pid() % 64)::smallint, -count(*)
      FROM stat_old_rows r
     WHERE r."deleted_at" IS NULL
     GROUP BY 2
    ON CONFLICT ("metric", "bucket", "slot")
    DO UPDATE SET "n" = "stat_counters"."n" + EXCLUDED."n";
  ELSIF TG_OP = 'TRUNCATE' THEN
    DELETE FROM "stat_counters" WHERE "metric" = 'messages';
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION stat_count_messages_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME <> 'messages'
     AND pg_partition_root(TG_RELID) IS DISTINCT FROM to_regclass('public.messages') THEN
    RETURN NULL;
  END IF;
  IF OLD."deleted_at" IS NULL THEN
    PERFORM stat_counter_add('messages', date_trunc('hour', OLD."created_at", 'UTC'), -1);
  END IF;
  IF NEW."deleted_at" IS NULL THEN
    PERFORM stat_counter_add('messages', date_trunc('hour', NEW."created_at", 'UTC'), 1);
  END IF;
  RETURN NULL;
END
$$;

-- users: one row at a time (sign-ups, role choice, account deletion); the
-- UPDATE trigger fires only when role or deleted_at is in the SET list and
-- the live/role state really changes.
CREATE FUNCTION stat_count_users() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME <> 'users'
     AND pg_partition_root(TG_RELID) IS DISTINCT FROM to_regclass('public.users') THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'TRUNCATE' THEN
    DELETE FROM "stat_counters" WHERE "metric" LIKE 'users.live.%';
    RETURN NULL;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD."deleted_at" IS NULL AND OLD."role" IS NOT NULL THEN
      PERFORM stat_counter_add('users.live.' || OLD."role"::text, 'epoch'::timestamptz, -1);
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    IF NEW."deleted_at" IS NULL AND NEW."role" IS NOT NULL THEN
      PERFORM stat_counter_add('users.live.' || NEW."role"::text, 'epoch'::timestamptz, 1);
    END IF;
  END IF;
  RETURN NULL;
END
$$;

-- The triggers take a SHARE ROW EXCLUSIVE lock on their table until this
-- migration commits, so no write slips between the trigger and the backfill
-- below: the counts start exact (the tables are small before launch; the
-- same pattern as 20261109090000_message_seq).
CREATE TRIGGER stat_count_messages_ins
  AFTER INSERT ON "messages" REFERENCING NEW TABLE AS stat_new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION stat_count_messages_stmt();
CREATE TRIGGER stat_count_messages_del
  AFTER DELETE ON "messages" REFERENCING OLD TABLE AS stat_old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION stat_count_messages_stmt();
CREATE TRIGGER stat_count_messages_trunc
  AFTER TRUNCATE ON "messages"
  FOR EACH STATEMENT EXECUTE FUNCTION stat_count_messages_stmt();
CREATE TRIGGER stat_count_messages_upd
  AFTER UPDATE OF "deleted_at", "created_at" ON "messages"
  FOR EACH ROW
  WHEN ((OLD."deleted_at" IS NULL) <> (NEW."deleted_at" IS NULL)
        OR OLD."created_at" <> NEW."created_at")
  EXECUTE FUNCTION stat_count_messages_row();

CREATE TRIGGER stat_count_users_ins
  AFTER INSERT ON "users"
  FOR EACH ROW WHEN (NEW."deleted_at" IS NULL AND NEW."role" IS NOT NULL)
  EXECUTE FUNCTION stat_count_users();
CREATE TRIGGER stat_count_users_del
  AFTER DELETE ON "users"
  FOR EACH ROW WHEN (OLD."deleted_at" IS NULL AND OLD."role" IS NOT NULL)
  EXECUTE FUNCTION stat_count_users();
CREATE TRIGGER stat_count_users_upd
  AFTER UPDATE OF "role", "deleted_at" ON "users"
  FOR EACH ROW
  WHEN (OLD."role" IS DISTINCT FROM NEW."role"
        OR (OLD."deleted_at" IS NULL) <> (NEW."deleted_at" IS NULL))
  EXECUTE FUNCTION stat_count_users();
CREATE TRIGGER stat_count_users_trunc
  AFTER TRUNCATE ON "users"
  FOR EACH STATEMENT EXECUTE FUNCTION stat_count_users();

INSERT INTO "stat_counters" ("metric", "bucket", "slot", "n")
SELECT 'messages', date_trunc('hour', "created_at", 'UTC'), 0, count(*)
  FROM "messages"
 WHERE "deleted_at" IS NULL
 GROUP BY 2;

INSERT INTO "stat_counters" ("metric", "bucket", "slot", "n")
SELECT 'users.live.' || "role"::text, 'epoch'::timestamptz, 0, count(*)
  FROM "users"
 WHERE "deleted_at" IS NULL AND "role" IS NOT NULL
 GROUP BY 1;

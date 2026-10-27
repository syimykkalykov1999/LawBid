-- Shard-ready steps 9-10: move-shard tool tables and the guard/change-capture
-- trigger function. Expand-only: nothing here changes behaviour until a move
-- installs the per-table triggers. Cross-family FKs are NOT dropped by this
-- migration (a drop would show as drift against schema.prisma and a deploy
-- rollback could not undo it); the tool drops them per database when the
-- second database is introduced and records the DDL in shard_dropped_fk.
-- CreateTable
CREATE TABLE "shard_moves" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logical_shard" SMALLINT NOT NULL,
    "from_db" TEXT NOT NULL,
    "to_db" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'preflight',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB,
    "error" TEXT,
    "requested_by" UUID,
    "heartbeat_at" TIMESTAMPTZ,
    "flipped_at" TIMESTAMPTZ,
    "leftover_db" TEXT,
    "cleanup_after" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shard_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shard_move_track" (
    "logical_shard" SMALLINT NOT NULL,
    "move_id" UUID NOT NULL,
    "frozen_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shard_move_track_pkey" PRIMARY KEY ("logical_shard")
);

-- CreateTable
CREATE TABLE "shard_change_log" (
    "id" BIGSERIAL NOT NULL,
    "table_name" TEXT NOT NULL,
    "pk" JSONB NOT NULL,
    "shard_id" SMALLINT NOT NULL,
    "op" CHAR(1) NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shard_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shard_dropped_fk" (
    "constraint_name" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "dropped_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shard_dropped_fk_pkey" PRIMARY KEY ("table_name","constraint_name")
);

-- CreateIndex
CREATE INDEX "shard_moves_logical_shard_status_idx" ON "shard_moves"("logical_shard", "status");

-- CreateIndex
CREATE INDEX "shard_moves_status_cleanup_after_idx" ON "shard_moves"("status", "cleanup_after");

-- CreateIndex
CREATE INDEX "shard_change_log_shard_id_id_idx" ON "shard_change_log"("shard_id", "id");


-- BEFORE INSERT/UPDATE/DELETE row trigger, installed by the move tool on the
-- sharded tables of a database while a logical shard is being moved:
--  * frozen shard (frozen_until in the future, or infinity = the old copy
--    after a flip) -> refuse the write with SQLSTATE 55P03 so no writer can
--    slip a change past the final catch-up. FOR SHARE on the track row makes
--    the freeze UPDATE wait for in-flight writers of the shard (the drain)
--    and makes a Serializable writer with an older snapshot retry (40001).
--    A crashed mover unfreezes by
--    itself when frozen_until passes.
--  * tracked shard -> write the primary key of the row to shard_change_log.
-- The tool's own copy / replay / cleanup sets lawbid.shard_move_bypass=on.
-- Trigger arguments are the primary key columns of the table.
CREATE OR REPLACE FUNCTION lawbid_shard_move_guard() RETURNS trigger AS $$
DECLARE
  rec jsonb;
  sid int;
  frozen timestamptz;
  tracked boolean;
  pk jsonb := '{}'::jsonb;
  col text;
BEGIN
  IF current_setting('lawbid.shard_move_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
  sid := (rec ->> 'shard_id')::int;
  SELECT true, t.frozen_until INTO tracked, frozen
    FROM shard_move_track t WHERE t.logical_shard = sid FOR SHARE;
  IF tracked IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF frozen IS NOT NULL AND frozen > now() THEN
    RAISE EXCEPTION 'logical shard % is frozen for a move; retry shortly', sid
      USING ERRCODE = '55P03';
  END IF;
  FOREACH col IN ARRAY TG_ARGV LOOP
    pk := pk || jsonb_build_object(col, rec -> col);
  END LOOP;
  INSERT INTO shard_change_log (table_name, pk, shard_id, op)
  VALUES (TG_TABLE_NAME, pk, sid, left(TG_OP, 1));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Shard-ready step 7 (docs/architecture/SHARDING_READY.md §6): the
-- transactional outbox for writes that cross families. Expand-only, no
-- behaviour change: nothing writes here while there is one database (the
-- effect runs inline in the caller's transaction).
--
-- cross_family_outbox exists on EVERY physical database (the migration
-- runner loops over them); a sharded write and its event commit together.
-- cross_family_inbox is read and written on the primary database only.
CREATE TABLE IF NOT EXISTS "cross_family_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "cross_family_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cross_family_outbox_status_check"
        CHECK ("status" IN ('pending', 'done', 'dead'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cross_family_outbox_idempotency_key_key"
    ON "cross_family_outbox"("idempotency_key");
CREATE INDEX IF NOT EXISTS "cross_family_outbox_status_next_attempt_at_idx"
    ON "cross_family_outbox"("status", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "cross_family_inbox" (
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cross_family_inbox_pkey" PRIMARY KEY ("idempotency_key")
);

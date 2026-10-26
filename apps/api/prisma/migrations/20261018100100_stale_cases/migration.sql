-- Owner 2026-10-18 (OQ-054): stale cases in the attorney feed.
-- client_active_at = the client's own last action on the case (attorney
-- bids and comments never move it); paused_at = hidden from the feed.
ALTER TABLE "cases" ADD COLUMN "client_active_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "cases" ADD COLUMN "paused_at" TIMESTAMPTZ;

-- Backfill: the latest of the creation, the client's journal entries and
-- the client's own chat messages in the case.
UPDATE "cases" c SET "client_active_at" = GREATEST(
  c."created_at",
  COALESCE((SELECT MAX(j."created_at") FROM "case_journal" j
            WHERE j."case_id" = c."id" AND j."actor_role" = 'client'), c."created_at"),
  COALESCE((SELECT MAX(m."created_at") FROM "messages" m
            JOIN "conversations" v ON v."id" = m."conversation_id"
            WHERE v."case_id" = c."id" AND m."sender_id" = c."client_id"), c."created_at")
);

-- The hourly jobs: silent open cases, and paused ones waiting to be archived.
CREATE INDEX "cases_open_client_active_idx" ON "cases" ("client_active_at", "id")
  WHERE "status" = 'open' AND "deleted_at" IS NULL AND "paused_at" IS NULL;
CREATE INDEX "cases_open_paused_idx" ON "cases" ("paused_at", "id")
  WHERE "status" = 'open' AND "deleted_at" IS NULL AND "paused_at" IS NOT NULL;

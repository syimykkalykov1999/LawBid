-- Owner 2026-10-26: infra switches from the admin (docs/runbooks/infra-from-admin.md).
-- One row per request to change a whitelisted Terraform switch. New, empty,
-- small table: plain DDL is fine.

CREATE TABLE IF NOT EXISTS "infra_change_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" TEXT NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requested_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "cost_delta_usd" JSONB NOT NULL,
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "rollback_of" UUID,
    "plan_summary" JSONB,
    "file_before" JSONB,
    "run_id" TEXT,
    "run_url" TEXT,
    "recorded" TEXT,
    "error" TEXT,
    "planned_at" TIMESTAMPTZ,
    "confirmed_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infra_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "infra_change_requests_status_check" CHECK ("status" IN (
      'requested','planning','planned','confirmed','applying',
      'done','failed','expired','cancelled','dry_run','rolled_back'))
);

CREATE INDEX IF NOT EXISTS "infra_change_requests_item_id_created_at_idx"
  ON "infra_change_requests"("item_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "infra_change_requests_created_at_idx"
  ON "infra_change_requests"("created_at" DESC);

-- Concurrency = 1: at most ONE request in progress, enforced by the database
-- (two admins tapping at once get a unique violation, not two applies).
CREATE UNIQUE INDEX IF NOT EXISTS "infra_change_requests_one_active"
  ON "infra_change_requests" ((true))
  WHERE "status" IN ('requested','planning','planned','confirmed','applying');

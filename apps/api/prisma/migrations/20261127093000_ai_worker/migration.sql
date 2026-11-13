SET LOCAL lock_timeout = '5s';
-- Owner 2026-11-12 «ИИ-сотрудник» (admin only, owner only): roles the owner
-- wrote once, their background mass runs, and one row per queue item with
-- the AI's proposal waiting for the owner's approve / reject. Expand-only:
-- three new tables nobody else reads.
CREATE TABLE "ai_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "instructions" TEXT NOT NULL,
    "queue" VARCHAR(40) NOT NULL,
    "model" VARCHAR(40) NOT NULL DEFAULT 'claude-opus-5-5',
    "output" VARCHAR(40) NOT NULL DEFAULT 'verdict',
    "confidence_min" SMALLINT NOT NULL DEFAULT 90,
    "audit_pct" SMALLINT NOT NULL DEFAULT 10,
    "created_by" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "ai_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "model" VARCHAR(40) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "proposed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "batch_id" VARCHAR(80),
    "reserved_millicents" INTEGER NOT NULL DEFAULT 0,
    "cost_millicents" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ,
    "error" VARCHAR(300),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_runs_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "ai_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ai_run_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "proposal" JSONB,
    "decision" VARCHAR(32),
    "confidence" SMALLINT,
    "lane" VARCHAR(16),
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" VARCHAR(300),
    "cost_millicents" INTEGER NOT NULL DEFAULT 0,
    "owner_decision" VARCHAR(32),
    "owner_note" VARCHAR(1000),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "ai_run_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ai_roles_archived_at_created_at_idx" ON "ai_roles"("archived_at", "created_at" DESC);
CREATE INDEX "ai_runs_status_next_attempt_at_idx" ON "ai_runs"("status", "next_attempt_at");
CREATE INDEX "ai_runs_role_id_created_at_idx" ON "ai_runs"("role_id", "created_at" DESC);
CREATE INDEX "ai_run_items_run_id_status_idx" ON "ai_run_items"("run_id", "status");
CREATE INDEX "ai_run_items_status_lane_created_at_idx" ON "ai_run_items"("status", "lane", "created_at");
CREATE INDEX "ai_run_items_reviewed_at_idx" ON "ai_run_items"("reviewed_at");
CREATE UNIQUE INDEX "ai_run_items_run_id_item_id_key" ON "ai_run_items"("run_id", "item_id");

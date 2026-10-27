-- Staff package T1 (2026-10-27, docs/architecture/ADMIN_STAFF_PACKAGE_PLAN_2026-10-27.md
-- part A): the schema of «Админка и сотрудники». Everything here is EMPTY
-- and unused until its admin switch (`staff.*_enabled`, all off) is turned on.
--  - admin_profiles gets `workspace` (mass | finance | owner, constant
--    default, PostgreSQL 11+ adds it without a rewrite) and
--    `is_workspace_head` (false); backfill super_admin -> owner,
--    finance -> finance, others stay mass. admin_profiles is a tiny table
--    (one row per staff member).
--  - 18 new tables: [L] operational, [S] snapshot, [E] journal (see the
--    comments on each model in schema.prisma).
-- Expand-only: the running release never reads these columns / tables.
SET LOCAL lock_timeout = '5s';

-- CreateEnum
CREATE TYPE "admin_workspace" AS ENUM ('mass', 'finance', 'owner');

-- AlterTable
ALTER TABLE "admin_profiles" ADD COLUMN     "is_workspace_head" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workspace" "admin_workspace" NOT NULL DEFAULT 'mass';

-- Backfill (one row per admin, a few rows in total).
UPDATE "admin_profiles" SET "workspace" = 'owner' WHERE "admin_role" = 'super_admin';
UPDATE "admin_profiles" SET "workspace" = 'finance' WHERE "admin_role" = 'finance';

-- admin_profiles holds one row per staff member (tens, at most ~1000 rows):
-- building the index inside the migration blocks writes for milliseconds.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "admin_profiles_workspace_idx" ON "admin_profiles"("workspace");

-- One head per workspace, enforced by the database (a partial index; Prisma
-- does not model partial indexes, like sessions_net_created_idx). Tiny
-- table, see above.
-- squawk-ignore require-concurrent-index-creation
CREATE UNIQUE INDEX "admin_profiles_one_head_per_workspace"
  ON "admin_profiles" ("workspace")
  WHERE "is_workspace_head";

-- The finance workspace has no head (plan A1). NOT VALID here, VALIDATE in
-- the next migration (20261107132100_staff_package_validate).
ALTER TABLE "admin_profiles"
  ADD CONSTRAINT "admin_profiles_no_finance_head"
  CHECK (NOT ("is_workspace_head" AND "workspace" = 'finance')) NOT VALID;

-- CreateTable
CREATE TABLE "work_leases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(24) NOT NULL,
    "item_id" UUID NOT NULL,
    "admin_id" UUID,
    "taken_at" TIMESTAMPTZ,
    "leased_until" TIMESTAMPTZ,
    "last_renew_at" TIMESTAMPTZ,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "excluded_admin_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "due_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_lease_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(24) NOT NULL,
    "item_id" UUID NOT NULL,
    "admin_id" UUID,
    "event" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(40),
    "held_ms" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_lease_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_member_states" (
    "admin_id" UUID NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'active',
    "state_reason" VARCHAR(200),
    "state_until" TIMESTAMPTZ,
    "trust_tier" SMALLINT NOT NULL DEFAULT 0,
    "joined_queue_at" TIMESTAMPTZ,
    "review_rate_override" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_member_states_pkey" PRIMARY KEY ("admin_id")
);

-- CreateTable
CREATE TABLE "staff_quality_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "item_kind" VARCHAR(24) NOT NULL,
    "item_id" UUID NOT NULL,
    "value" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_quality_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_review_samples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "decision_kind" VARCHAR(24) NOT NULL,
    "item_id" UUID NOT NULL,
    "decided_by" UUID NOT NULL,
    "reviewer_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "verdict" VARCHAR(12),
    "is_golden" BOOLEAN NOT NULL DEFAULT false,
    "golden_answer" JSONB,
    "stage" VARCHAR(16),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ,

    CONSTRAINT "staff_review_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_daily_stats" (
    "admin_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "workspace" "admin_workspace" NOT NULL,
    "decided" INTEGER NOT NULL DEFAULT 0,
    "avg_handle_sec" INTEGER NOT NULL DEFAULT 0,
    "p90_handle_sec" INTEGER NOT NULL DEFAULT 0,
    "online_min" INTEGER NOT NULL DEFAULT 0,
    "reopened" INTEGER NOT NULL DEFAULT 0,
    "complaints" INTEGER NOT NULL DEFAULT 0,
    "csat_up" INTEGER NOT NULL DEFAULT 0,
    "csat_down" INTEGER NOT NULL DEFAULT 0,
    "sampled" INTEGER NOT NULL DEFAULT 0,
    "sample_diff" INTEGER NOT NULL DEFAULT 0,
    "golden_total" INTEGER NOT NULL DEFAULT 0,
    "golden_fail" INTEGER NOT NULL DEFAULT 0,
    "too_fast" INTEGER NOT NULL DEFAULT 0,
    "late_sla" INTEGER NOT NULL DEFAULT 0,
    "lease_lost" INTEGER NOT NULL DEFAULT 0,
    "skips" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_daily_stats_pkey" PRIMARY KEY ("admin_id","day")
);

-- CreateTable
CREATE TABLE "staff_rating_snapshots" (
    "admin_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "workspace" "admin_workspace" NOT NULL,
    "rating" INTEGER,
    "n_decisions" INTEGER NOT NULL DEFAULT 0,
    "accuracy" INTEGER,
    "clean" INTEGER,
    "users_verdict" INTEGER,
    "speed" INTEGER,
    "status" VARCHAR(12) NOT NULL DEFAULT 'low_data',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank_pct" SMALLINT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_rating_snapshots_pkey" PRIMARY KEY ("admin_id","snapshot_date")
);

-- CreateTable
CREATE TABLE "staff_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "snapshot_date" DATE NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "actor_id" UUID,
    "source" VARCHAR(12) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "reason_code" VARCHAR(40) NOT NULL,
    "reason_note" VARCHAR(1000),
    "rating_snapshot" JSONB,
    "ends_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_case_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_id" UUID NOT NULL,
    "action_id" UUID,
    "item_kind" VARCHAR(24) NOT NULL,
    "item_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'new',
    "outcome" VARCHAR(12),
    "reviewer_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "staff_case_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "author_alias" SERIAL NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "head_admin_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "file_key" VARCHAR(300),
    "status" VARCHAR(12) NOT NULL DEFAULT 'new',
    "owner_note" VARCHAR(2000),
    "owner_decision" VARCHAR(16) NOT NULL DEFAULT 'none',
    "ack_at" TIMESTAMPTZ,
    "decided_at" TIMESTAMPTZ,
    "reveal_log" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_retaliation_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appeal_id" UUID NOT NULL,
    "subject_admin_id" UUID NOT NULL,
    "action_id" UUID,
    "window_until" TIMESTAMPTZ NOT NULL,
    "hold_until" TIMESTAMPTZ,
    "state" VARCHAR(12) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "staff_retaliation_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_head_snapshots" (
    "head_admin_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "team_quality" INTEGER,
    "turnover_score" INTEGER,
    "complaints_score" INTEGER,
    "speed_score" INTEGER,
    "score" INTEGER,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_head_snapshots_pkey" PRIMARY KEY ("head_admin_id","snapshot_date")
);

-- CreateTable
CREATE TABLE "staff_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(24) NOT NULL,
    "workspace" "admin_workspace" NOT NULL DEFAULT 'mass',
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "boost_mult" DECIMAL(3,2),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_piecework_days" (
    "admin_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 0,
    "held_units" INTEGER NOT NULL DEFAULT 0,
    "rate_cents" INTEGER NOT NULL DEFAULT 0,
    "quality_mult" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "amount_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "accrual_ref" VARCHAR(120),
    "status" VARCHAR(12) NOT NULL DEFAULT 'accrued',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_piecework_days_pkey" PRIMARY KEY ("admin_id","day","kind")
);

-- CreateTable
CREATE TABLE "staff_anomalies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day" DATE NOT NULL,
    "admin_id" UUID NOT NULL,
    "rule" VARCHAR(40) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_nav_pins" (
    "admin_id" UUID NOT NULL,
    "href" VARCHAR(200) NOT NULL,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_nav_pins_pkey" PRIMARY KEY ("admin_id","href")
);

-- CreateTable
CREATE TABLE "staff_digests" (
    "week_start" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_digests_pkey" PRIMARY KEY ("week_start")
);

-- CreateIndex
CREATE INDEX "work_leases_leased_until_idx" ON "work_leases"("leased_until");

-- CreateIndex
CREATE INDEX "work_leases_kind_leased_until_idx" ON "work_leases"("kind", "leased_until");

-- CreateIndex
CREATE UNIQUE INDEX "work_leases_kind_item_id_key" ON "work_leases"("kind", "item_id");

-- CreateIndex
CREATE INDEX "work_lease_events_admin_id_created_at_idx" ON "work_lease_events"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "work_lease_events_kind_item_id_created_at_idx" ON "work_lease_events"("kind", "item_id", "created_at");

-- CreateIndex
CREATE INDEX "work_lease_events_created_at_idx" ON "work_lease_events"("created_at");

-- CreateIndex
CREATE INDEX "staff_member_states_state_idx" ON "staff_member_states"("state");

-- CreateIndex
CREATE INDEX "staff_quality_signals_admin_id_created_at_idx" ON "staff_quality_signals"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "staff_quality_signals_kind_created_at_idx" ON "staff_quality_signals"("kind", "created_at");

-- CreateIndex
CREATE INDEX "staff_quality_signals_created_at_idx" ON "staff_quality_signals"("created_at");

-- CreateIndex
CREATE INDEX "staff_review_samples_status_created_at_idx" ON "staff_review_samples"("status", "created_at");

-- CreateIndex
CREATE INDEX "staff_review_samples_reviewer_id_status_idx" ON "staff_review_samples"("reviewer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_review_samples_decision_kind_item_id_key" ON "staff_review_samples"("decision_kind", "item_id");

-- CreateIndex
CREATE INDEX "staff_daily_stats_day_workspace_idx" ON "staff_daily_stats"("day", "workspace");

-- CreateIndex
CREATE INDEX "staff_rating_snapshots_snapshot_date_status_idx" ON "staff_rating_snapshots"("snapshot_date", "status");

-- CreateIndex
CREATE INDEX "staff_rating_snapshots_snapshot_date_workspace_rating_idx" ON "staff_rating_snapshots"("snapshot_date", "workspace", "rating");

-- CreateIndex
CREATE INDEX "staff_suggestions_status_kind_created_at_idx" ON "staff_suggestions"("status", "kind", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "staff_suggestions_admin_id_kind_snapshot_date_key" ON "staff_suggestions"("admin_id", "kind", "snapshot_date");

-- CreateIndex
CREATE INDEX "staff_actions_admin_id_created_at_idx" ON "staff_actions"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "staff_actions_actor_id_created_at_idx" ON "staff_actions"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "staff_case_appeals_status_created_at_idx" ON "staff_case_appeals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_case_appeals_admin_id_item_kind_item_id_key" ON "staff_case_appeals"("admin_id", "item_kind", "item_id");

-- CreateIndex
CREATE INDEX "admin_appeals_status_created_at_idx" ON "admin_appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "admin_appeals_head_admin_id_created_at_idx" ON "admin_appeals"("head_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_appeals_author_id_created_at_idx" ON "admin_appeals"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "staff_retaliation_flags_state_created_at_idx" ON "staff_retaliation_flags"("state", "created_at");

-- CreateIndex
CREATE INDEX "staff_retaliation_flags_subject_admin_id_idx" ON "staff_retaliation_flags"("subject_admin_id");

-- CreateIndex
CREATE INDEX "staff_rates_kind_valid_from_idx" ON "staff_rates"("kind", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "staff_piecework_days_day_idx" ON "staff_piecework_days"("day");

-- CreateIndex
CREATE INDEX "staff_anomalies_day_score_idx" ON "staff_anomalies"("day", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "staff_anomalies_day_admin_id_rule_key" ON "staff_anomalies"("day", "admin_id", "rule");

-- Only held leases are looked up by holder ("what is in my hands").
CREATE INDEX "work_leases_admin_id_held_idx" ON "work_leases"("admin_id")
  WHERE "admin_id" IS NOT NULL;

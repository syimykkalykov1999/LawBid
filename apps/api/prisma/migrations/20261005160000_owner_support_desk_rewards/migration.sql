-- Owner 2026-10-05: support 24/7 (SLA, auto-assignment, ready answers,
-- shifts, after-hours auto-reply) and staff rewards («Лучший сотрудник»).
-- Additive only.
ALTER TABLE "support_tickets"
  ADD COLUMN "assigned_at" TIMESTAMPTZ,
  ADD COLUMN "first_response_at" TIMESTAMPTZ,
  ADD COLUMN "first_response_by" UUID,
  ADD COLUMN "resolved_by" UUID,
  ADD COLUMN "sla_due_at" TIMESTAMPTZ,
  ADD COLUMN "sla_breached_at" TIMESTAMPTZ;

CREATE INDEX "support_tickets_sla_due_at_idx" ON "support_tickets"("sla_due_at");

ALTER TABLE "support_messages" ADD COLUMN "auto" BOOL NOT NULL DEFAULT false;

CREATE TABLE "support_macros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "category" VARCHAR(20),
    "active" BOOL NOT NULL DEFAULT true,
    "uses" INT4 NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_macros_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_macros_active_title_idx" ON "support_macros"("active", "title");

CREATE TABLE "support_agents" (
    "admin_id" UUID NOT NULL,
    "on_shift" BOOL NOT NULL DEFAULT false,
    "max_open" INT4 NOT NULL DEFAULT 25,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_agents_pkey" PRIMARY KEY ("admin_id")
);

CREATE TABLE "staff_rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "period" VARCHAR(20) NOT NULL,
    "department" VARCHAR(24) NOT NULL,
    "admin_id" UUID NOT NULL,
    "rank" INT4 NOT NULL DEFAULT 1,
    "score" INT4 NOT NULL DEFAULT 0,
    "prize" VARCHAR(200) NOT NULL DEFAULT '',
    "bonus_cents" INT4 NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "accrual_id" UUID,
    "auto" BOOL NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_rewards_period_department_admin_id_key" ON "staff_rewards"("period", "department", "admin_id");
CREATE INDEX "staff_rewards_admin_id_created_at_idx" ON "staff_rewards"("admin_id", "created_at" DESC);

-- Tunables (data only; the admin changes them in Связь → Поддержка and
-- Люди → Поощрения). Rewards stay off until the owner switches them on.
INSERT INTO "app_config" ("key", "value", "updated_at") VALUES
  ('support.auto_assign', 'true'::JSONB, now()),
  ('support.sla_first_response_minutes', '60'::JSONB, now()),
  ('support.sla_urgent_minutes', '15'::JSONB, now()),
  ('support.sla_alerts', 'true'::JSONB, now()),
  ('support.escalate_on_breach', 'true'::JSONB, now()),
  ('support.always_open', 'true'::JSONB, now()),
  ('support.open_days', '[1,2,3,4,5]'::JSONB, now()),
  ('support.open_from_hour', '9'::JSONB, now()),
  ('support.open_to_hour', '18'::JSONB, now()),
  ('support.timezone', '"America/Chicago"'::JSONB, now()),
  ('support.auto_reply', 'true'::JSONB, now()),
  ('support.auto_close_resolved_days', '7'::JSONB, now()),
  ('rewards.enabled', 'false'::JSONB, now()),
  ('rewards.auto_award', 'true'::JSONB, now()),
  ('rewards.period', '"month"'::JSONB, now())
ON CONFLICT ("key") DO NOTHING;

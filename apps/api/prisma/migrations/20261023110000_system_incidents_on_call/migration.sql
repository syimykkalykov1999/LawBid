-- Owner 2026-10-22: «Состояние системы» — incidents opened/closed by the watchdog,
-- and the per-admin on-call switch. Expand-only.
CREATE TABLE "system_incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "component" VARCHAR(40) NOT NULL,
  "severity" VARCHAR(8) NOT NULL DEFAULT 'red',
  "title" VARCHAR(200) NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}',
  "opened_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "closed_at" TIMESTAMPTZ,
  "last_notified_at" TIMESTAMPTZ,
  "notify_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "system_incidents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_incidents_opened_at_idx" ON "system_incidents" ("opened_at" DESC);
-- One open incident per component (de-dup under concurrent watchdogs).
CREATE UNIQUE INDEX "system_incidents_one_open_idx" ON "system_incidents" ("component") WHERE "closed_at" IS NULL;

ALTER TABLE "admin_profiles" ADD COLUMN "on_call_enabled" BOOLEAN NOT NULL DEFAULT true;

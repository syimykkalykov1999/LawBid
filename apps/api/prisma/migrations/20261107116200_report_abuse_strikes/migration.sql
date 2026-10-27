-- Owner 2026-10-27: weighted reports, unfounded-reporter ladder (DSA Art. 23
-- style), strikes for content owners, automatic account actions with
-- appeals, and the text-detection log.
ALTER TABLE "reports" ADD COLUMN "priority_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reports" ADD COLUMN "target_author_id" UUID;
CREATE INDEX "reports_target_author_id_created_at_idx" ON "reports" ("target_author_id", "created_at");

CREATE TABLE "reporter_standings" (
  "user_id" UUID NOT NULL,
  "warnings" INTEGER NOT NULL DEFAULT 0,
  "warned_at" TIMESTAMPTZ,
  "suspended_until" TIMESTAMPTZ,
  "suspensions" INTEGER NOT NULL DEFAULT 0,
  "last_reason" TEXT,
  "history" JSONB NOT NULL DEFAULT '[]',
  "appeal_message" TEXT,
  "appeal_status" "moderation_appeal_status",
  "appeal_at" TIMESTAMPTZ,
  "appeal_decided_by" UUID,
  "appeal_decided_at" TIMESTAMPTZ,
  "appeal_note" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reporter_standings_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "reporter_standings_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "reporter_standings_appeal_len" CHECK ("appeal_message" IS NULL OR char_length("appeal_message") BETWEEN 1 AND 1000)
);
CREATE INDEX "reporter_standings_suspended_until_idx" ON "reporter_standings" ("suspended_until");
CREATE INDEX "reporter_standings_appeal_status_appeal_at_idx" ON "reporter_standings" ("appeal_status", "appeal_at");

CREATE TABLE "user_strikes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "action_id" UUID,
  "target_type" "report_target_type",
  "target_id" UUID,
  "points" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "restriction" VARCHAR(16),
  "restriction_until" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "revoked_by" UUID,
  "revoked_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_strikes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_strikes_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "user_strikes_restriction_check" CHECK ("restriction" IS NULL OR "restriction" IN ('cooldown', 'limited', 'suspended')),
  -- 0 points = a limit carried by an automatic account action.
  CONSTRAINT "user_strikes_points_check" CHECK ("points" >= 0)
);
CREATE UNIQUE INDEX "user_strikes_action_id_key" ON "user_strikes" ("action_id");
CREATE INDEX "user_strikes_user_id_expires_at_idx" ON "user_strikes" ("user_id", "expires_at");

CREATE TABLE "moderation_auto_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(24) NOT NULL,
  "user_id" UUID NOT NULL,
  "target_type" "report_target_type",
  "target_id" UUID,
  "score" DOUBLE PRECISION NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "borderline" BOOLEAN NOT NULL DEFAULT false,
  "enforced" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "expires_at" TIMESTAMPTZ,
  "reversed_at" TIMESTAMPTZ,
  "appeal_message" TEXT,
  "appeal_status" "moderation_appeal_status",
  "appeal_at" TIMESTAMPTZ,
  "appeal_decided_by" UUID,
  "appeal_decided_at" TIMESTAMPTZ,
  "appeal_note" TEXT,
  "appeal_auto_approved" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "moderation_auto_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "moderation_auto_actions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "moderation_auto_actions_kind_check" CHECK ("kind" IN ('content_hide', 'account_limit', 'account_suspend_temp', 'account_suspend', 'review_needed')),
  CONSTRAINT "moderation_auto_actions_appeal_len" CHECK ("appeal_message" IS NULL OR char_length("appeal_message") BETWEEN 1 AND 1000)
);
CREATE INDEX "moderation_auto_actions_user_id_created_at_idx" ON "moderation_auto_actions" ("user_id", "created_at" DESC);
CREATE INDEX "moderation_auto_actions_appeal_status_appeal_at_idx" ON "moderation_auto_actions" ("appeal_status", "appeal_at");
CREATE INDEX "moderation_auto_actions_created_at_idx" ON "moderation_auto_actions" ("created_at");

CREATE TABLE "moderation_detections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "content_kind" VARCHAR(24) NOT NULL,
  "provider" VARCHAR(24) NOT NULL,
  "mode" VARCHAR(8) NOT NULL,
  "category" VARCHAR(48) NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "decision" VARCHAR(8) NOT NULL,
  "acted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "moderation_detections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "moderation_detections_created_at_idx" ON "moderation_detections" ("created_at");
CREATE INDEX "moderation_detections_user_id_created_at_idx" ON "moderation_detections" ("user_id", "created_at" DESC);

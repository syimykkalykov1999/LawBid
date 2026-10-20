-- Owner 2026-10-20 (privacy and moderation): who sees my last seen / may write
-- to me / may call me, and appeals against moderation decisions.
-- CreateEnum
CREATE TYPE "privacy_audience" AS ENUM ('everyone', 'contacts', 'nobody');

-- CreateEnum
CREATE TYPE "moderation_appeal_status" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "user_privacy_settings" (
    "user_id" UUID NOT NULL,
    "last_seen" "privacy_audience" NOT NULL DEFAULT 'everyone',
    "message_from" "privacy_audience" NOT NULL DEFAULT 'everyone',
    "call_from" "privacy_audience" NOT NULL DEFAULT 'everyone',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_privacy_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "moderation_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appellant_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "moderation_appeal_status" NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_appeals_action_id_key" ON "moderation_appeals"("action_id");

-- CreateIndex
CREATE INDEX "moderation_appeals_status_created_at_idx" ON "moderation_appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "moderation_appeals_appellant_id_created_at_idx" ON "moderation_appeals"("appellant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_appellant_fkey" FOREIGN KEY ("appellant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_action_fkey" FOREIGN KEY ("action_id") REFERENCES "moderation_actions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


ALTER TABLE "moderation_appeals"
  ADD CONSTRAINT "moderation_appeals_message_len" CHECK (char_length("message") BETWEEN 1 AND 1000);

-- Those who already hid their activity status keep it hidden.
INSERT INTO "user_privacy_settings" ("user_id", "last_seen", "updated_at")
SELECT "id", 'nobody', now() FROM "users" WHERE "show_activity_status" = false;

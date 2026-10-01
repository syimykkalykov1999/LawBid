-- Owner 2026-09-30 (OQ-048): plans and attorney assistants.
-- Monthly: $399 + $100 per assistant seat (0–6); yearly: attorney + 6
-- assistants, 20 % off ($9,590). An assistant has no subscription or
-- profile of their own: they work inside the attorney's account under
-- their own login, every action is logged, publications wait for the
-- attorney's approval, and they never bid.
CREATE TYPE "subscription_plan" AS ENUM ('monthly', 'yearly');
ALTER TABLE "subscriptions" ADD COLUMN "plan" "subscription_plan" NOT NULL DEFAULT 'monthly';
ALTER TABLE "subscriptions" ADD COLUMN "assistant_seats" INT2 NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_assistant_seats_range" CHECK ("assistant_seats" BETWEEN 0 AND 6);

ALTER TYPE "user_role" ADD VALUE 'assistant';

CREATE TYPE "assistant_status" AS ENUM ('invited', 'active', 'removed');
CREATE TYPE "assistant_approval" AS ENUM ('purchase', 'attorney_added', 'attorney_otp');

CREATE TABLE "assistant_memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attorney_id" UUID NOT NULL,
  "assistant_user_id" UUID NULL,
  "phone_e164" STRING NOT NULL,
  "display_name" STRING NULL,
  "status" "assistant_status" NOT NULL DEFAULT 'invited',
  "approval" "assistant_approval" NOT NULL,
  -- calls · chats · files · cases · bid_drafts · posts · tasks · profile
  "duties" STRING[] NOT NULL DEFAULT ARRAY[]::STRING[],
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "joined_at" TIMESTAMPTZ NULL,
  "removed_at" TIMESTAMPTZ NULL,
  CONSTRAINT "assistant_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_memberships_name_len" CHECK ("display_name" IS NULL OR char_length("display_name") <= 80)
);
CREATE INDEX "assistant_memberships_attorney_id_status_idx" ON "assistant_memberships"("attorney_id", "status");
CREATE INDEX "assistant_memberships_phone_e164_status_idx" ON "assistant_memberships"("phone_e164", "status");
CREATE INDEX "assistant_memberships_assistant_user_id_idx" ON "assistant_memberships"("assistant_user_id");
-- One live membership per phone (an assistant works for one attorney).
CREATE UNIQUE INDEX "assistant_memberships_live_phone_key" ON "assistant_memberships"("phone_e164") WHERE "status" != 'removed';
ALTER TABLE "assistant_memberships" ADD CONSTRAINT "assistant_memberships_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_memberships" ADD CONSTRAINT "assistant_memberships_assistant_user_id_fkey" FOREIGN KEY ("assistant_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every action of an assistant (the attorney's "Team" feed).
CREATE TABLE "assistant_activity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attorney_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "action" STRING NOT NULL,
  "target_type" STRING NULL,
  "target_id" STRING NULL,
  "summary" STRING NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_activity_attorney_id_created_at_idx" ON "assistant_activity"("attorney_id", "created_at" DESC);
CREATE INDEX "assistant_activity_membership_id_created_at_idx" ON "assistant_activity"("membership_id", "created_at" DESC);
ALTER TABLE "assistant_activity" ADD CONSTRAINT "assistant_activity_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "assistant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Publications and profile edits waiting for the attorney's approval.
CREATE TYPE "assistant_request_kind" AS ENUM ('post', 'comment', 'case_comment', 'profile_edit');
CREATE TYPE "assistant_request_status" AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE "assistant_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attorney_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "kind" "assistant_request_kind" NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "assistant_request_status" NOT NULL DEFAULT 'pending',
  "result_id" STRING NULL,
  "note" STRING NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "decided_at" TIMESTAMPTZ NULL,
  CONSTRAINT "assistant_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_requests_attorney_id_status_created_at_idx" ON "assistant_requests"("attorney_id", "status", "created_at" DESC);
ALTER TABLE "assistant_requests" ADD CONSTRAINT "assistant_requests_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "assistant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tasks assistants set for the attorney (Mine → Tasks).
CREATE TYPE "attorney_task_kind" AS ENUM ('call', 'meeting', 'court', 'deadline', 'documents', 'print', 'visit', 'other');
CREATE TYPE "attorney_task_status" AS ENUM ('open', 'taken', 'done', 'not_done', 'cancelled');
CREATE TABLE "attorney_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attorney_id" UUID NOT NULL,
  "created_by_membership_id" UUID NULL,
  "kind" "attorney_task_kind" NOT NULL,
  "title" STRING NOT NULL,
  "notes" STRING NULL,
  "due_at" TIMESTAMPTZ NULL,
  "location" STRING NULL,
  "case_id" UUID NULL,
  "contact_name" STRING NULL,
  "contact_phone" STRING NULL,
  "file_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "status" "attorney_task_status" NOT NULL DEFAULT 'open',
  "outcome_note" STRING NULL,
  "rescheduled_to" TIMESTAMPTZ NULL,
  "done_at" TIMESTAMPTZ NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "attorney_tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attorney_tasks_title_len" CHECK (char_length("title") BETWEEN 1 AND 160),
  CONSTRAINT "attorney_tasks_notes_len" CHECK ("notes" IS NULL OR char_length("notes") <= 2000)
);
CREATE INDEX "attorney_tasks_attorney_id_status_due_at_idx" ON "attorney_tasks"("attorney_id", "status", "due_at");
ALTER TABLE "attorney_tasks" ADD CONSTRAINT "attorney_tasks_attorney_id_fkey" FOREIGN KEY ("attorney_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attorney_tasks" ADD CONSTRAINT "attorney_tasks_membership_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "assistant_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attorney_tasks" ADD CONSTRAINT "attorney_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Who in the team actually sent a chat message (shown to the client as
-- "Assistant of <attorney>").
ALTER TABLE "messages" ADD COLUMN "sent_by_membership_id" UUID NULL;
ALTER TYPE "file_purpose" ADD VALUE 'task_attachment';
ALTER TYPE "notification_type" ADD VALUE 'assistant_request';
ALTER TYPE "notification_type" ADD VALUE 'assistant_task';
ALTER TYPE "notification_type" ADD VALUE 'assistant_joined';

-- Owner 2026-10-20: calls from a group chat (video / phone buttons in the
-- group header). Such a call has no one-to-one conversation: it points at the
-- group instead.
ALTER TABLE "calls" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "calls" ADD COLUMN IF NOT EXISTS "group_id" UUID;
CREATE INDEX IF NOT EXISTS "calls_group_id_status_idx" ON "calls" ("group_id", "status");

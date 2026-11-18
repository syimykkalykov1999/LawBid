-- Verify 17.11: group messages changed (edited, deleted for everyone,
-- reactions) after the phone's newest one reach it in the offline catch-up,
-- as 1:1 messages do (messages.updated_at). Nullable, no default: instant.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "chat_group_messages" ADD COLUMN "changed_at" TIMESTAMPTZ;

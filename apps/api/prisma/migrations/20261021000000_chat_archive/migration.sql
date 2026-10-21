-- Owner 2026-10-20: the chat Archive (direct chats and groups), only for me.
ALTER TABLE "conversation_participants" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ;
ALTER TABLE "chat_group_members" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ;

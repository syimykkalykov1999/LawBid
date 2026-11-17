SET LOCAL lock_timeout = '5s';
-- Row 110 (Telegram / WhatsApp «Mark as unread»): my own unread mark on a
-- chat. Additive only: one nullable column, no default, no rewrite.
ALTER TABLE "conversation_participants" ADD COLUMN IF NOT EXISTS "marked_unread_at" TIMESTAMPTZ;

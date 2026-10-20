-- Owner 2026-10-20: "read at HH:MM" per message, from the last-read pointer.
ALTER TABLE "conversation_participants" ADD COLUMN "last_read_at" TIMESTAMPTZ;
UPDATE "conversation_participants" SET "last_read_at" = "updated_at"
  WHERE "last_read_message_id" IS NOT NULL;

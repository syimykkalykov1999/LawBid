-- Owner 2026-09-30 (OQ-047): photos and documents in chats once the bid
-- is accepted (contacts unlocked) — any number, every common format.
ALTER TYPE "file_purpose" ADD VALUE 'chat_attachment';
ALTER TYPE "message_type" ADD VALUE 'attachment';
-- The original file name shown on the document card (≤200 chars).
ALTER TABLE "messages" ADD COLUMN "file_name" STRING NULL;
ALTER TABLE "messages" ADD CONSTRAINT "messages_file_name_len" CHECK ("file_name" IS NULL OR char_length("file_name") BETWEEN 1 AND 200);

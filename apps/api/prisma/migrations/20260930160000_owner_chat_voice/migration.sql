-- Owner 2026-09-30 (OQ-040): voice messages in chats, like Telegram.
ALTER TYPE "file_purpose" ADD VALUE 'chat_voice';
ALTER TYPE "message_type" ADD VALUE 'voice';

ALTER TABLE "messages" ADD COLUMN "file_id" UUID REFERENCES "files"("id") ON DELETE RESTRICT;
ALTER TABLE "messages" ADD COLUMN "duration_ms" INT4;
ALTER TABLE "messages" ADD COLUMN "waveform" INT4[] NOT NULL DEFAULT ARRAY[]::INT4[];
ALTER TABLE "messages" ADD COLUMN "listened_at" TIMESTAMPTZ;
CREATE INDEX "messages_file_id_idx" ON "messages"("file_id");

SET LOCAL lock_timeout = '5s';
-- Groups WhatsApp parity (voice): a voice note in a group, the same as in a
-- 1:1 chat (messages.duration_ms / waveform, file purpose chat_voice).
-- Expand-only: one enum value and two columns nobody reads yet; the running
-- release ignores them (a nullable column and a constant default are
-- metadata-only in Postgres, no rewrite of the hash partitions).
ALTER TYPE "group_message_type" ADD VALUE IF NOT EXISTS 'voice';

ALTER TABLE "chat_group_messages" ADD COLUMN "duration_ms" INTEGER;
ALTER TABLE "chat_group_messages" ADD COLUMN "waveform" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

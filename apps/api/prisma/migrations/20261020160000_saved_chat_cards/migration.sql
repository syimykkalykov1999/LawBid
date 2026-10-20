-- Owner 2026-10-20: «Сохранённое» for chat messages (WeChat favorites /
-- Telegram Saved Messages) and two new message kinds: a shared attorney
-- card (`contact`) and a place (`place`). Expand only: a new table and two
-- enum values.
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'contact';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'place';

CREATE TYPE "saved_chat_kind" AS ENUM ('text', 'link', 'file', 'media', 'voice', 'contact', 'place');

CREATE TABLE "saved_chat_messages" (
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "kind" "saved_chat_kind" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_chat_messages_pkey" PRIMARY KEY ("user_id","message_id")
);

CREATE INDEX "saved_chat_messages_user_id_kind_created_at_idx" ON "saved_chat_messages"("user_id", "kind", "created_at" DESC);
CREATE INDEX "saved_chat_messages_user_id_created_at_idx" ON "saved_chat_messages"("user_id", "created_at" DESC);
CREATE INDEX "saved_chat_messages_message_id_idx" ON "saved_chat_messages"("message_id");

ALTER TABLE "saved_chat_messages" ADD CONSTRAINT "saved_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_chat_messages" ADD CONSTRAINT "saved_chat_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

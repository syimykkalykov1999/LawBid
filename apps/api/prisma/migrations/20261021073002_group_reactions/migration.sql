-- Owner 2026-10-21 (inbox 26c): reactions in groups — the group's setting
-- (all / selected / off) and one emoji per person per message.
ALTER TABLE "chat_groups" ADD COLUMN     "reactions_allowed" VARCHAR(16)[] DEFAULT ARRAY[]::VARCHAR(16)[],
ADD COLUMN     "reactions_mode" VARCHAR(8) NOT NULL DEFAULT 'all';

CREATE TABLE "chat_group_message_reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_group_message_reactions_pkey" PRIMARY KEY ("message_id","user_id")
);

CREATE INDEX "chat_group_message_reactions_user_id_idx" ON "chat_group_message_reactions"("user_id");

ALTER TABLE "chat_group_message_reactions" ADD CONSTRAINT "chat_group_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_group_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

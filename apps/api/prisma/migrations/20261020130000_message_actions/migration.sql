-- Owner 2026-10-20: edit / delete / reply / forward / react / pin in chats.
ALTER TABLE "messages"
  ADD COLUMN "edited_at" TIMESTAMPTZ,
  ADD COLUMN "revoked_at" TIMESTAMPTZ,
  ADD COLUMN "reply_to_id" UUID,
  ADD COLUMN "forwarded" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id")
  REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

CREATE TABLE "message_hidden" (
  "message_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "message_hidden_pkey" PRIMARY KEY ("message_id", "user_id"),
  CONSTRAINT "message_hidden_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "message_hidden_user_id_idx" ON "message_hidden"("user_id");

CREATE TABLE "message_reactions" (
  "message_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "emoji" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id"),
  CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "message_edits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" UUID NOT NULL,
  "body_original" TEXT NOT NULL,
  "edited_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_edits_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "message_edits_message_id_idx" ON "message_edits"("message_id");

CREATE TABLE "message_pins" (
  "message_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "pinned_by" UUID NOT NULL,
  "pinned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "message_pins_pkey" PRIMARY KEY ("message_id"),
  CONSTRAINT "message_pins_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "message_pins_conversation_id_pinned_at_idx"
  ON "message_pins"("conversation_id", "pinned_at" DESC);

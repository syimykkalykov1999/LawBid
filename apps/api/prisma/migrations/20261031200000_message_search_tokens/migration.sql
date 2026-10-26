-- BUG-1 (2026-10-25, package N-12b): chat text search over sealed bodies.
-- messages.body_display is AES-GCM ciphertext, so the old LIKE '%word%'
-- never matched in production. Blind index: one row per distinct word of a
-- text / attachment message, token = HMAC-SHA256(SEARCH_INDEX_KEY, word)
-- truncated to 16 bytes (no word is stored). A query asks for messages that
-- hold ALL typed words (intersection) inside the chats of the caller.
--
--  * primary key (conversation_id, token, message_id): the lookup "this
--    token in this chat" is one index range; duplicates are impossible.
--  * (message_id): an edit / delete removes the message's rows.
-- No foreign keys: messages may become a partitioned table (its primary
-- key would then include created_at). New, empty table: plain DDL is fine.

CREATE TABLE IF NOT EXISTS "message_search_tokens" (
    "conversation_id" UUID NOT NULL,
    "token" BYTEA NOT NULL,
    "message_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_search_tokens_pkey" PRIMARY KEY ("conversation_id","token","message_id")
);

CREATE INDEX IF NOT EXISTS "message_search_tokens_message_id_idx"
  ON "message_search_tokens"("message_id");

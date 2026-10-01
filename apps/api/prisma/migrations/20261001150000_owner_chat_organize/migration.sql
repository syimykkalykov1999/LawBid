-- Owner 2026-10-01: Instagram-like chat folders for each member — Primary
-- / General (NULL = automatic: case chats are Primary), "waiting for my
-- answer" with a note pinned on the chat ("send him the documents"), and
-- chats pinned to the top.
CREATE TYPE IF NOT EXISTS chat_folder AS ENUM ('primary', 'general');
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS folder chat_folder NULL;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ NULL;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS note STRING(280) NULL;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS conversation_participants_waiting_idx ON conversation_participants (user_id, waiting_since) WHERE waiting_since IS NOT NULL;

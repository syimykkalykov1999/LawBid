-- Audit 17.11 (problem 4): the 1:1 catch-up after a long offline also
-- returns the edits and deletes for everyone of messages the phone already
-- holds — `conversation_id = $1 AND deleted_at IS NULL AND updated_at > $2`
-- (chat.service.ts messages(afterId)). Without this index that walked every
-- message of the chat. Partial on `deleted_at IS NULL` (written literally in
-- the query; keeps the index out of Prisma's schema diff, like the other
-- concurrent indexes).
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_conv_updated_idx
  ON messages (conversation_id, updated_at)
  WHERE deleted_at IS NULL;

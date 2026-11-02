-- Partial (WHERE seq IS NOT NULL) so Prisma leaves it out of its schema diff,
-- like the other concurrent indexes; rows the trigger numbers always match it.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "messages_conversation_id_seq_key"
  ON "messages" ("conversation_id", "seq")
  WHERE "seq" IS NOT NULL;

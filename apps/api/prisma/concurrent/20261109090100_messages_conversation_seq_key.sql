CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "messages_conversation_id_seq_key" ON "messages" ("conversation_id", "seq");

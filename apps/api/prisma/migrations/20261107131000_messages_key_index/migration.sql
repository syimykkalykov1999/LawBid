-- Expand step for 20261107131300_partition_messages_notifications (perf
-- review 2026-10-26, R-19): the future composite primary key (id, conversation_id) is built
-- here as a unique index WITHOUT blocking writes. One statement per file:
-- CONCURRENTLY cannot run inside a transaction (same as messages_expiry_idx).
-- The next migration turns it into the primary key (USING INDEX, no rebuild).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS messages_id_conversation_id_key
  ON public.messages USING btree (id, conversation_id);

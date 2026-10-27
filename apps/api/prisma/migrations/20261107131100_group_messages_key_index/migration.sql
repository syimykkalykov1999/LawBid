-- Expand step for 20261107131300_partition_messages_notifications (perf
-- review 2026-10-26, R-19): the future composite primary key (id, group_id) is built
-- here as a unique index WITHOUT blocking writes. One statement per file:
-- CONCURRENTLY cannot run inside a transaction (same as messages_expiry_idx).
-- The next migration turns it into the primary key (USING INDEX, no rebuild).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS chat_group_messages_id_group_id_key
  ON public.chat_group_messages USING btree (id, group_id);

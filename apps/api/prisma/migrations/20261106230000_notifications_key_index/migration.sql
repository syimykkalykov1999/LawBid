-- Expand step for 20261106240000_partition_messages_notifications (perf
-- review 2026-10-26, R-19): the future composite primary key (id, user_id) is built
-- here as a unique index WITHOUT blocking writes. One statement per file:
-- CONCURRENTLY cannot run inside a transaction (same as messages_expiry_idx).
-- The next migration turns it into the primary key (USING INDEX, no rebuild).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS notifications_id_user_id_key
  ON public.notifications USING btree (id, user_id);

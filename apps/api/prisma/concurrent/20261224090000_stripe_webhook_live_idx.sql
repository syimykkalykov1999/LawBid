-- Foreman re-check 25.11 (item 8): the requeue sweep now reads only the
-- unprocessed events that are not dead (dead_at IS NULL, migration
-- 20261224090000_stripe_webhook_dead_at). This partial index holds exactly
-- those rows, so the dead events of the DLQ are not walked over on every
-- run; it stays tiny (almost every event is processed within seconds).
-- Partial, like stripe_webhook_events_unprocessed_idx, so Prisma leaves it
-- out of its schema diff.
CREATE INDEX CONCURRENTLY IF NOT EXISTS stripe_webhook_events_live_idx
  ON stripe_webhook_events (created_at, stripe_event_id)
  WHERE processed_at IS NULL AND dead_at IS NULL;

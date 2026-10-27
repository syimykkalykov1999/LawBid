-- Perf review 2026-10-26 (R-35): the every-minute `stripe-webhooks.requeue`
-- reads the stored Stripe events that are still unprocessed, oldest first.
-- Without an index that was a sequential scan of the whole (JSON) table
-- 1 440 times a day. The index holds only the unprocessed rows (almost none),
-- so it stays tiny. One statement per file, CONCURRENTLY (no write block),
-- raw SQL only: Prisma does not model partial indexes (like messages_expiry_idx).
CREATE INDEX CONCURRENTLY IF NOT EXISTS stripe_webhook_events_unprocessed_idx
  ON public.stripe_webhook_events USING btree (created_at, stripe_event_id)
  WHERE processed_at IS NULL;

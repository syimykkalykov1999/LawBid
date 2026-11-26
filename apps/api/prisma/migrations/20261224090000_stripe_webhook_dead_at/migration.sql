-- Foreman re-check 25.11 (item 8): a Stripe event whose job failed for good
-- sits in the DLQ with processed_at null, and the every-minute
-- `stripe-webhooks.requeue` looked at it again on every run, for ever.
-- billing.runner.ts `toDlq` now stamps dead_at; the sweep skips such rows
-- and the admin «Повторить» (QueueAdminService.replayStripeDlq) clears it.
-- Additive only: a nullable column is a catalog change, no table rewrite.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "stripe_webhook_events" ADD COLUMN IF NOT EXISTS "dead_at" TIMESTAMPTZ;

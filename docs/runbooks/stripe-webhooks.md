# stripe-webhooks — events moved to the dead-letter queue

An event lands in `stripe-webhooks-dlq` after 5 failed attempts
(`stripe webhook moved to DLQ`, docs/06 §1.5). The handler always
re-reads the subscription from Stripe, so replaying is safe.

**Check.**
1. Worker logs: the `eventId`, `type`, `err`.
2. Stripe Dashboard → Developers → Webhooks: delivery status, and whether
   Stripe itself reports failures/delay (endpoint 5xx → our intake).
3. `stripe_webhook_events` row: `attempts`, `processed_at` null.

**Act.**
- Transient (DB/Redis outage) → replay: from a maintenance shell move the
  DLQ jobs back (`Queue('stripe-webhooks').add` with the same `eventId`),
  or "Resend" from the Stripe Dashboard (idempotent by `stripe_event_id`).
- Deterministic (unknown status, schema change) → fix the sync service,
  deploy, then replay.
- Meanwhile access is unaffected for `active/trialing`; a missed
  `payment_failed` only delays the `past_due` grace — check the
  *Subscriptions* admin page for the affected attorney.

## Stage 6.7 — Stripe: subscription backend

docs/06_PRODUCTION.md §13 stage 6.7, §1.1–1.6.

### API
- `modules/billing` behind `PaymentProvider` (§1.8): `StripePaymentProvider`
  (official SDK; customers, SetupIntents, subscriptions with
  `trial_period_days = 7`, card fingerprint, Customer Portal, webhook
  signature) and `FakePaymentProvider` used when `STRIPE_SECRET_KEY` is
  unset (dev / e2e; webhooks with `Stripe-Signature: fake`, state
  versioned so out-of-order events behave like Stripe's re-read).
- `SubscriptionAccessService` is real (§1.2): `trialing`/`active`, or
  `past_due` before `grace_ends_at`; Redis cache 60 s, dropped by the sync
  service and admin actions; a transaction client bypasses the cache
  (bid accept). The stage-4 stub (verified ⇒ active) is gone.
- `POST /subscriptions/start` (verified attorneys; customer + SetupIntent,
  `trialEligible`), `POST /subscriptions/confirm` (card → subscription;
  one trial per attorney and per `card_fingerprint`, otherwise `409
  SUBSCRIPTION_TRIAL_UNAVAILABLE` until the app repeats with `chargeNow`),
  `GET /subscriptions/me`, `GET /subscriptions/payments`, `POST
  /subscriptions/portal-session`, `POST /subscriptions/cancel`
  (`cancel_at_period_end`).
- `POST /webhooks/stripe` (§1.5): raw-body signature, row in
  `stripe_webhook_events` (idempotent by id), immediate 200, BullMQ queue
  `stripe-webhooks` (5 attempts, exponential backoff, then
  `stripe-webhooks-dlq` + error log). `SubscriptionSyncService` re-reads
  the subscription from the provider for every event and reconciles the
  row; access transitions: lost → `BidsService.withdrawActiveBidsForAttorney`
  + `subscription_status`; regained → `subscription_status`;
  `invoice.payment_failed` / `payment_action_required` → `past_due`,
  `grace_ends_at = now + subscription.past_due_grace_days`, failed
  `payments` row, `subscription_payment_failed`; `invoice.paid` →
  succeeded `payments` row; `charge.refunded` → `refunded`. Status map:
  `unpaid` / `incomplete_expired` → `expired`; a cancellation without a
  successful payment → `expired` (OQ-H).
- Trial reminder: delayed BullMQ job (`subscriptions` queue) at
  `trial_ends_at − 2 days`, skipped when canceled or no longer trialing
  (`subscription_trial_ending` with date and amount).
- Admin (§1.6): `GET /admin/subscriptions/:userId` (support, finance,
  super_admin — subscription, payments, Stripe Dashboard link, trials used
  with the card), `POST /admin/subscriptions/:userId/extend` (finance,
  super_admin; days + reason; `trial_end` moved at the provider, audited,
  `subscription_status` to the attorney).
- Workers run in the API process while `JOBS_ENABLED` and always in the
  `worker` process (`BillingModule.register({ mode })`). New optional env
  `STRIPE_PORTAL_RETURN_URL`; `stripe` dependency added. New `ErrorCode`s:
  `PAYMENTS_NOT_CONFIGURED`, `SUBSCRIPTION_ALREADY_ACTIVE`,
  `SUBSCRIPTION_TRIAL_UNAVAILABLE`, `SUBSCRIPTION_SETUP_INCOMPLETE`,
  `SUBSCRIPTION_NOT_FOUND`, `WEBHOOK_SIGNATURE_INVALID`.
- Contract regenerated.

### Tests
- Unit: `SubscriptionAccessService` (rule table, cache + invalidate,
  transaction bypass).
- e2e `stage-6-7.e2e-spec.ts` (fake provider): gates (client 403,
  unverified 403, confirm before the card 409); trial → `invoice.paid` +
  `subscription.updated` → active with one payment; the same event id
  again is not queued and creates no duplicate; a late older event does
  not win; bad signature 400; failed payment → `past_due` with grace
  (still active, notified, failed payment row) → `unpaid` → `expired`,
  bid withdrawn, `subscription_status`; re-subscription after expiry needs
  `chargeNow`; the same card on another attorney gets no trial; cancel
  keeps access with `cancelAtPeriodEnd`; portal URL; trial reminder
  payload and skip-after-cancel; admin view (support), extend (finance,
  audited), moderator 403.
- Real-Stripe acceptance (test mode, test clocks) runs with
  `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` set —
  the same code path, provider swapped (OQ-021).

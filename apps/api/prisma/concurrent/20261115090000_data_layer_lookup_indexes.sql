-- Data-layer audit 2026-11-04 (R-395, docs/dev/DB_SEARCH_LOAD_AUDIT_2026-11-04.md):
-- lookups that had no index starting with their column, so every call read
-- the whole table. Partial (WHERE col IS NOT NULL) like the other concurrent
-- indexes, so Prisma leaves them out of its schema diff; the queries always
-- look up a concrete value, so they match the predicate.
--
-- Stripe webhooks: invoice.paid / payment_intent.* find the payment row by
-- its PaymentIntent (billing/subscription-sync.service.ts, 6 call sites).
CREATE INDEX CONCURRENTLY IF NOT EXISTS payments_stripe_payment_intent_idx
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
-- charge.dispute.* / charge.refunded find the case payment by its charge
-- (case-payments/case-payments.service.ts, 4 call sites).
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_payments_stripe_charge_idx
  ON case_payments (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;
-- A bid's outcome is posted into the chat opened for that bid
-- (bids/bids.service.ts notifyOutcome).
CREATE INDEX CONCURRENTLY IF NOT EXISTS conversations_bid_id_idx
  ON conversations (bid_id)
  WHERE bid_id IS NOT NULL;
-- Admin case card: contact-issue reports of one case
-- (admin-cases/admin-case-management.service.ts card).
CREATE INDEX CONCURRENTLY IF NOT EXISTS contact_issue_reports_case_idx
  ON contact_issue_reports (case_id, created_at DESC)
  WHERE case_id IS NOT NULL;
-- Paid boosts: the payment webhook finds the promotion by its payment
-- (billing/subscriptions.service.ts).
CREATE INDEX CONCURRENTLY IF NOT EXISTS case_promotions_payment_idx
  ON case_promotions (payment_id)
  WHERE payment_id IS NOT NULL;

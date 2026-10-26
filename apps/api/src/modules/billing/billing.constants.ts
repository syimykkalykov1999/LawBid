/** docs/06 §1.1: "$399 в месяц, USD, единственный тариф; триал 7 дней". */
export const SUBSCRIPTION_PRICE_CENTS = 39_900;
export const SUBSCRIPTION_CURRENCY = 'usd';
/** Owner 2026-09-30 (OQ-048): $100 / month per assistant. Owner
 * 2026-10-05: the number of seats is the admin setting
 * `billing.max_assistant_seats`; MAX_ASSISTANT_SEATS is only the
 * fallback when settings are unavailable, and SEATS_HARD_CAP bounds what
 * the admin may set. */
export const ASSISTANT_SEAT_PRICE_CENTS = 10_000;
export const MAX_ASSISTANT_SEATS = 10;
export const SEATS_HARD_CAP = 50;
export const YEARLY_PRICE_CENTS = 959_000;
/** Owner 2026-10-05: the trial length is the admin setting
 * `billing.trial_days` (PricingService.trialDays); TRIAL_DAYS is only the
 * fallback when settings are unavailable. */
// Owner 2026-10-14: 14 days (or the plan's trial offers, whichever ends first).
export const TRIAL_DAYS = 7;
export const TRIAL_DAYS_MAX = 365;
/** §1.5: reminder "за 2 дня до окончания" of the trial. */
export const TRIAL_REMINDER_DAYS_BEFORE = 2;

export const STRIPE_WEBHOOKS_QUEUE = 'stripe-webhooks';
export const STRIPE_WEBHOOKS_DLQ = 'stripe-webhooks-dlq';
export const STRIPE_WEBHOOK_JOB = 'stripe-event';
export const SUBSCRIPTION_JOBS_QUEUE = 'subscriptions';
export const TRIAL_REMINDER_JOB = 'trial-reminder';
/** S10-6: hourly sweep that re-creates delayed reminder jobs Redis lost. */
export const TRIAL_REMINDER_RECONCILE_JOB = 'trial-reminder-reconcile';
/** A reminder is "missed" (sent late by the sweep) only this long after its
 * time, so the sweep never races the delayed job itself. */
export const TRIAL_REMINDER_MISSED_AFTER_MS = 30 * 60_000;

/** §1.5 "5 повторов с backoff, затем dead-letter". */
export const WEBHOOK_JOB_OPTS = {
  attempts: 5,
  // 15 s → 30 s → 60 s → 120 s (≈ 4 min): a Stripe 429 burst is not a DLQ.
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { count: 5_000 },
  removeOnFail: { count: 5_000 },
} as const;

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const BILLING_OPTIONS = Symbol('BILLING_OPTIONS');

export interface BillingModuleOptions {
  /** 'api': queue workers run only while JOBS_ENABLED; 'worker': always. */
  mode: 'api' | 'worker';
}

/** Events the webhook accepts (§1.5); everything else is stored and skipped. */
export const HANDLED_STRIPE_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  // Owner 2026-10-22: a seat purchase (pending_if_incomplete) applied
  // after 3-D Secure, or dropped. The Stripe webhook endpoint must have
  // these two events switched on (Dashboard → Webhooks).
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'setup_intent.succeeded',
  'charge.refunded',
  // Owner 2026-10-02: hosted checkout paid (subscription or case promotion).
  'checkout.session.completed',
  // Owner 2026-10-22: a Boost paid on our own card page (PaymentIntent).
  // Switch it on for the webhook endpoint (Dashboard → Webhooks).
  'payment_intent.succeeded',
  // Owner 2026-10-05: Stripe Connect — an attorney's account changed, a
  // client's payment was disputed / the dispute closed.
  'account.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  // Stripe robustness 2026-10-27. Switch these on for BOTH webhook
  // endpoints (platform and Connect) in Workbench → Webhooks.
  'payment_intent.payment_failed',
  'checkout.session.expired',
  'charge.refund.updated',
  'payout.failed',
  'account.application.deauthorized',
  'capability.updated',
  'radar.early_fraud_warning.created',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'invoice.upcoming',
  'customer.subscription.trial_will_end',
]);

/** The fake checkout pages exist only in development and tests. */
export function fakeCheckoutAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== 'production' && nodeEnv !== 'staging';
}

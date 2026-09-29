/** docs/06 §1.1: "$399 в месяц, USD, единственный тариф; триал 7 дней". */
export const SUBSCRIPTION_PRICE_CENTS = 39_900;
export const SUBSCRIPTION_CURRENCY = 'usd';
export const TRIAL_DAYS = 7;
/** §1.5: reminder "за 2 дня до окончания" of the trial. */
export const TRIAL_REMINDER_DAYS_BEFORE = 2;

export const STRIPE_WEBHOOKS_QUEUE = 'stripe-webhooks';
export const STRIPE_WEBHOOKS_DLQ = 'stripe-webhooks-dlq';
export const STRIPE_WEBHOOK_JOB = 'stripe-event';
export const SUBSCRIPTION_JOBS_QUEUE = 'subscriptions';
export const TRIAL_REMINDER_JOB = 'trial-reminder';

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
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'setup_intent.succeeded',
  'charge.refunded',
]);

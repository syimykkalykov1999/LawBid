/**
 * docs/06 §1.8: the payment layer behind an interface so profile
 * promotion / video (flags) or an in-app-purchase implementation (§11.4)
 * can be added without touching the subscription business logic. Today:
 * StripePaymentProvider; FakePaymentProvider when Stripe keys are absent
 * (dev / e2e), driven through the same webhook endpoint.
 */
export type ProviderSubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface ProviderSubscription {
  id: string;
  customerId: string;
  status: ProviderSubscriptionStatus;
  /** Unix seconds. */
  trialStart: number | null;
  trialEnd: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  defaultPaymentMethodId: string | null;
  metadata: Record<string, string>;
}

export interface ProviderInvoice {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountCents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  paidAt: number | null;
  paymentIntentId: string | null;
  failureCode: string | null;
}

export interface ProviderCharge {
  id: string;
  paymentIntentId: string | null;
  refunded: boolean;
  amountRefundedCents: number;
}

export interface ProviderSetupIntent {
  id: string;
  customerId: string | null;
  status: string;
  paymentMethodId: string | null;
}

export interface ProviderEvent {
  id: string;
  type: string;
  created: number;
  /** The event's `data.object` — an id and a type are all the handler
   * uses; state is always re-read from the provider (§1.5). */
  object: { object: string; id: string } & Record<string, unknown>;
}

export class WebhookSignatureError extends Error {}

export interface PaymentProvider {
  readonly name: 'stripe' | 'fake';
  createCustomer(input: {
    userId: string;
    email: string | null;
  }): Promise<string>;
  createSetupIntent(
    customerId: string,
  ): Promise<{ id: string; clientSecret: string }>;
  retrieveSetupIntent(id: string): Promise<ProviderSetupIntent | null>;
  /** Card fingerprint of a payment method (§1.1: one trial per card). */
  paymentMethodFingerprint(paymentMethodId: string): Promise<string | null>;
  createSubscription(input: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    trialDays: number | null;
    metadata: Record<string, string>;
  }): Promise<ProviderSubscription>;
  retrieveSubscription(id: string): Promise<ProviderSubscription | null>;
  setCancelAtPeriodEnd(
    id: string,
    cancel: boolean,
  ): Promise<ProviderSubscription>;
  /** docs/06 §5.1 account anonymization: cancel immediately, no proration
   * refund; the row is then synced like any provider state. */
  cancelNow(id: string): Promise<ProviderSubscription>;
  /** §1.6 "продлить подписку на N дней": moves trial_end / the period. */
  extendUntil(id: string, untilUnix: number): Promise<ProviderSubscription>;
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
  retrieveInvoice(id: string): Promise<ProviderInvoice | null>;
  retrieveCharge(id: string): Promise<ProviderCharge | null>;
  /** Verifies the signature and parses the body; throws WebhookSignatureError. */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): ProviderEvent;
  /** Stripe Dashboard link for the admin panel (null for the fake). */
  dashboardUrl(subscriptionId: string): string | null;
}

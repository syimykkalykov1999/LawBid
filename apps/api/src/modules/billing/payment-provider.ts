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

/** Owner 2026-09-30: a hosted Stripe Checkout page (web payment). */
export interface ProviderCheckoutSession {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  customerId: string | null;
  subscriptionId: string | null;
  metadata: Record<string, string>;
  /** One-time (mode=payment) sessions only (owner 2026-10-02). */
  paymentIntentId?: string | null;
  amountTotalCents?: number | null;
  /** paid | unpaid | no_payment_required. */
  paymentStatus?: string | null;
}

export class WebhookSignatureError extends Error {}

export interface PaymentProvider {
  readonly name: 'stripe' | 'fake';
  /** Owner 2026-10-03: which Stripe account mode the keys belong to
   * (plan prices keep one Stripe price id per mode). */
  readonly mode?: PriceMode;
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
  /** §1.1 on web checkout: a card that already had a trial pays now. */
  endTrialNow(id: string): Promise<ProviderSubscription>;
  createPortalSession(customerId: string, returnUrl: string): Promise<string>;
  /** Owner 2026-09-30: subscription checkout on Stripe's hosted page
   * (cheapest store-compliant path; the app opens it in the browser). */
  createCheckoutSession(input: {
    customerId: string;
    /** OQ-048: the plan's prices with quantities. */
    lineItems: { priceId: string; quantity: number }[];
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    /** Owner 2026-10-02: a promo code's coupon applied to the session
     * (then the page's own promotion-code box is off). */
    couponId?: string | null;
  }): Promise<ProviderCheckoutSession>;
  retrieveCheckoutSession(id: string): Promise<ProviderCheckoutSession | null>;
  /** OQ-048: set the assistant-seat quantity of a monthly subscription
   * (0 removes the item; prorated). */
  setSeatQuantity(
    subscriptionId: string,
    seatPriceId: string,
    quantity: number,
    /** Owner 2026-10-03: older seat prices — an existing seat item on one
     * of them keeps its price and only changes quantity. */
    knownSeatPriceIds?: string[],
  ): Promise<ProviderSubscription>;
  /** Owner 2026-10-01: monthly → yearly ("Prime"): every item replaced by
   * the yearly price; the difference is invoiced now. */
  switchToYearly(
    subscriptionId: string,
    yearlyPriceId: string,
  ): Promise<ProviderSubscription>;
  retrieveInvoice(id: string): Promise<ProviderInvoice | null>;
  retrieveCharge(id: string): Promise<ProviderCharge | null>;
  /** Verifies the signature and parses the body; throws WebhookSignatureError. */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): ProviderEvent;
  /** Stripe Dashboard link for the admin panel (null for the fake). */
  dashboardUrl(subscriptionId: string): string | null;
  /** Owner 2026-10-02 (admin promo codes): a coupon plus a customer-facing
   * promotion code with the same code. */
  createCoupon?(input: ProviderCouponInput): Promise<ProviderCoupon>;
  /** Stops new redemptions of the coupon (and its promotion codes). */
  deleteCoupon?(couponId: string): Promise<void>;
  /** Owner 2026-10-02 (admin refunds): refund part or all of a payment. */
  refund?(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<ProviderRefund>;
  /** Owner 2026-10-02 (referrals): credit applied to the customer's next
   * invoice(s) (Stripe customer balance, negative = credit). */
  creditCustomerBalance?(
    customerId: string,
    cents: number,
    description: string,
    idempotencyKey?: string,
  ): Promise<void>;
  /** Owner 2026-10-03 (admin prices): a new recurring Stripe price on the
   * plan's product (created when none is given). */
  createPrice?(input: ProviderPriceInput): Promise<ProviderPrice>;
  /** Owner 2026-10-03: move a subscription's items that are on one of
   * [fromPriceIds] to [toPriceId], same quantity, no proration — the new
   * amount applies from the next renewal. null when no item matched. */
  replaceItemPrice?(
    subscriptionId: string,
    fromPriceIds: string[],
    toPriceId: string,
  ): Promise<ProviderSubscription | null>;
  /** Owner 2026-10-02 (case promotion): a hosted one-time payment page. */
  createOneTimeCheckout?(
    input: ProviderOneTimeCheckoutInput,
  ): Promise<{ id: string; url: string }>;
}

export interface ProviderOneTimeCheckoutInput {
  customerEmail?: string | null;
  amountCents: number;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}

export interface ProviderCouponInput {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string;
  maxRedemptions: number | null;
  /** Unix seconds. */
  redeemBy: number | null;
  metadata: Record<string, string>;
}

export interface ProviderCoupon {
  couponId: string;
  promotionCodeId: string | null;
}

export interface ProviderRefund {
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
  failureReason: string | null;
}

export type PriceMode = 'test' | 'live' | 'fake';

export interface ProviderPriceInput {
  /** Reused when set; otherwise taken from [productFromPriceId] or created. */
  productId: string | null;
  /** An existing price whose product the new price should join. */
  productFromPriceId: string | null;
  productName: string;
  amountCents: number;
  currency: string;
  interval: 'month' | 'year';
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface ProviderPrice {
  priceId: string;
  productId: string;
}

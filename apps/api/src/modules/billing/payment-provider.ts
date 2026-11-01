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
  /** Owner 2026-10-22: the items with their quantities — the sync reads
   * the assistant-seat item's quantity from here (absent on old fakes). */
  items?: ProviderSubscriptionItem[];
  /** A `payment_behavior=pending_if_incomplete` change waiting for its
   * invoice to be paid (expires at that moment, unix seconds). */
  pendingUpdateExpiresAt?: number | null;
  latestInvoiceId?: string | null;
  /** When the subscription was created (unix seconds; absent on old fakes). */
  created?: number | null;
}

export interface ProviderSubscriptionItem {
  priceId: string;
  quantity: number;
  /** The price's amount per unit and period, in cents. */
  unitAmountCents: number | null;
}

/** Owner 2026-10-22 (Stripe Tax): a billing address the buyer gave us. */
export interface ProviderTaxAddress {
  /** ISO 3166-1 alpha-2. */
  country: string;
  postalCode?: string | null;
  state?: string | null;
  city?: string | null;
  line1?: string | null;
}

/** Where Stripe Tax may place the buyer: an address and/or the IP. */
export interface ProviderTaxLocation {
  address?: ProviderTaxAddress | null;
  ip?: string | null;
}

/** Owner 2026-10-22 (Stripe Tax): tax computed for a one-time amount. */
export interface ProviderTaxCalculation {
  /** The Stripe Tax calculation id (kept on the PaymentIntent). */
  calculationId: string;
  /** Pre-tax amount, the tax, and what is charged. */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

/** Owner 2026-10-22: what buying seats now costs (Stripe's preview of
 * the invoice the change creates at once). */
export interface ProviderSeatPreview {
  /** The prorated rest of the current period for the added seats. */
  amountNowCents: number;
  /** Stripe Tax: the tax inside [amountNowCents] (null = no tax computed). */
  taxCents?: number | null;
  currency: string;
  /** The proration moment to send back with the purchase (unix seconds). */
  prorationDate: number;
  /** Where the current period ends (unix seconds); null when unknown. */
  periodEnd: number | null;
}

export interface ProviderSeatCharge {
  /** applied = paid, the seats are on the subscription; requires_action =
   * the bank asks for 3-D Secure ([clientSecret] is the PaymentIntent's);
   * failed = the card was declined (the invoice is voided, nothing changed). */
  status: 'applied' | 'requires_action' | 'failed';
  invoiceId: string | null;
  amountCents: number;
  currency: string;
  clientSecret: string | null;
  subscription: ProviderSubscription;
}

export interface ProviderSeatItemInput {
  subscriptionId: string;
  seatPriceId: string;
  /** Older seat prices whose item keeps its price (quantity only). */
  knownSeatPriceIds?: string[];
}

export interface ProviderInvoice {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  amountCents: number;
  /** Owner 2026-10-22 (Stripe Tax): the tax on the invoice and the amount
   * before it; null when the provider does not say. */
  taxCents?: number | null;
  subtotalCents?: number | null;
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
  /** Owner 2026-10-11 (in-app payment sheet): the order the app asked
   * for, kept on the SetupIntent until the card is confirmed. */
  metadata: Record<string, string>;
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
    /** Owner 2026-10-22 (Stripe Tax): where the buyer is, when known. */
    tax?: ProviderTaxLocation | null;
  }): Promise<string>;
  /** Owner 2026-10-22 (Stripe Tax): a billing address / IP for the
   * customer, so automatic tax can place them. */
  updateCustomerTaxLocation?(
    customerId: string,
    location: ProviderTaxLocation,
  ): Promise<void>;
  /** True when Stripe Tax can compute tax for this customer (it has a
   * recognised location); false = automatic tax must stay off for them. */
  customerTaxSupported?(customerId: string): Promise<boolean>;
  /** Tax for a one-time amount (our own card page) at [location]. */
  calculateTax?(input: {
    amountCents: number;
    currency: string;
    reference: string;
    customerId?: string | null;
    location: ProviderTaxLocation;
  }): Promise<ProviderTaxCalculation>;
  /** After the payment succeeded: the calculation becomes a tax
   * transaction (Stripe Tax reporting). Returns its id. */
  recordTaxTransaction?(
    calculationId: string,
    reference: string,
  ): Promise<string>;
  /** Owner 2026-10-22: a paid amount changed (tax added): same intent,
   * new amount and metadata. */
  updatePaymentIntent?(
    id: string,
    patch: { amountCents: number; metadata: Record<string, string> },
  ): Promise<ProviderPaymentIntent>;
  createSetupIntent(
    customerId: string,
    metadata?: Record<string, string>,
  ): Promise<{ id: string; clientSecret: string }>;
  retrieveSetupIntent(id: string): Promise<ProviderSetupIntent | null>;
  /** Card fingerprint of a payment method (§1.1: one trial per card). */
  paymentMethodFingerprint(paymentMethodId: string): Promise<string | null>;
  createSubscription(input: {
    customerId: string;
    priceId: string;
    /** Owner 2026-10-11: the plan's prices with quantities (plan + extra
     * seats); [priceId] alone is the single-price legacy call. */
    lineItems?: { priceId: string; quantity: number }[];
    /** A promo / referral coupon applied to the subscription. */
    couponId?: string | null;
    paymentMethodId: string;
    trialDays: number | null;
    metadata: Record<string, string>;
    /** Audit #15: one key per client checkout attempt (the client's
     * Idempotency-Key, else the attempt id kept on the SetupIntent). A
     * retry of the same attempt never creates a second subscription; a
     * new attempt (new SetupIntent) is a new request. */
    idempotencyKey: string;
    /** Owner 2026-10-22: Stripe Tax on the subscription (admin switch
     * billing.stripe_tax_enabled); applied only when the customer has a
     * recognised tax location. */
    automaticTax?: boolean;
  }): Promise<ProviderSubscription>;
  retrieveSubscription(id: string): Promise<ProviderSubscription | null>;
  setCancelAtPeriodEnd(
    id: string,
    cancel: boolean,
  ): Promise<ProviderSubscription>;
  /** docs/06 §5.1 account anonymization: cancel immediately, no proration
   * refund; the row is then synced like any provider state. */
  cancelNow(
    id: string,
    opts?: { idempotencyKey?: string },
  ): Promise<ProviderSubscription>;
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
    /** Owner 2026-10-22: Stripe Tax — the hosted page collects the billing
     * address and adds the tax. */
    automaticTax?: boolean;
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
    /** Owner 2026-10-22: `none` for a seat removed at the period end (no
     * refund, no credit); default `create_prorations` (legacy). */
    prorationBehavior?: 'none' | 'create_prorations',
  ): Promise<ProviderSubscription>;
  /** Owner 2026-10-22: the price of going from the subscription's current
   * seat quantity up by [addSeats] now (the invoice it would create). */
  previewSeatIncrease(
    input: ProviderSeatItemInput & {
      addSeats: number;
      prorationDate: number;
      automaticTax?: boolean;
    },
  ): Promise<ProviderSeatPreview>;
  /** Owner 2026-10-22: set the seat quantity to [quantity] and charge the
   * prorated rest of the period NOW (`always_invoice`); the change is
   * applied only when that invoice is paid (`pending_if_incomplete`). */
  chargeSeatIncrease(
    input: ProviderSeatItemInput & {
      quantity: number;
      prorationDate: number;
      idempotencyKey: string;
      automaticTax?: boolean;
    },
  ): Promise<ProviderSeatCharge>;
  /** Voids an open invoice (a pending seat change that will not be paid). */
  voidInvoice?(invoiceId: string): Promise<void>;
  /** Owner 2026-10-01: monthly → yearly ("Prime"): every item replaced by
   * the yearly price; the difference is invoiced now. */
  switchToYearly(
    subscriptionId: string,
    yearlyPriceId: string,
    automaticTax?: boolean,
  ): Promise<ProviderSubscription>;
  retrieveInvoice(id: string): Promise<ProviderInvoice | null>;
  retrieveCharge(id: string): Promise<ProviderCharge | null>;
  /** Verifies the signature and parses the body; throws WebhookSignatureError. */
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
    /** Owner 2026-10-05: `connect` = the Connect endpoint (its own
     * signing secret; events carry the connected account). */
    options?: { connect?: boolean },
  ): ProviderEvent;
  /** Stripe Dashboard link for the admin panel (null for the fake). */
  dashboardUrl(subscriptionId: string): string | null;
  /** Owner 2026-10-02 (admin promo codes): a coupon plus a customer-facing
   * promotion code with the same code. */
  createCoupon?(input: ProviderCouponInput): Promise<ProviderCoupon>;
  /** Stops new redemptions of the coupon (and its promotion codes). */
  deleteCoupon?(couponId: string): Promise<void>;
  /** Owner 2026-10-22 (GDPR Art. 17, audit #4 §5): deletes the customer
   * (on a connected account when [stripeAccount] is given). Stripe keeps
   * its invoices and payments for finance; a customer already deleted is a
   * no-op, so account anonymization can retry it. */
  deleteCustomer?(
    customerId: string,
    options?: { stripeAccount?: string },
  ): Promise<void>;
  /** Algo audit M-4 (owner 2026-10-28): every subscription of a customer
   * (any status, newest first, at most [limit]) — finds a duplicate bought
   * from a second device or left behind by a re-subscription. */
  listCustomerSubscriptions?(
    customerId: string,
    limit?: number,
  ): Promise<ProviderSubscription[]>;
  /** Algo audit M-4: true when any charge of the PaymentIntent was ever
   * disputed (chargeback) — such money is never refunded automatically. */
  paymentIntentDisputed?(paymentIntentId: string): Promise<boolean>;
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
  /** Owner 2026-10-22: a one-time payment confirmed on our own card page
   * (card fields, Apple Pay, Google Pay) instead of Stripe's hosted page. */
  createPaymentIntent?(
    input: ProviderPaymentIntentInput,
  ): Promise<ProviderPaymentIntent>;
  retrievePaymentIntent?(id: string): Promise<ProviderPaymentIntent | null>;
  /** Voids an unpaid PaymentIntent; returns its state after the call (a
   * paid one stays `succeeded` — the caller then applies it). */
  cancelPaymentIntent?(id: string): Promise<ProviderPaymentIntent | null>;
  /** Closes an open hosted checkout so it can not be paid any more;
   * returns the session after the call (`complete` = it was paid). */
  expireCheckoutSession?(id: string): Promise<ProviderCheckoutSession | null>;
  /** Owner 2026-10-22: a new card from the card page becomes the
   * subscription's card (seat purchases are charged to it). */
  setSubscriptionPaymentMethod?(
    subscriptionId: string,
    paymentMethodId: string,
  ): Promise<void>;

  // ---- Stripe Connect (owner 2026-10-05: client → attorney payments) ----

  /** An Express connected account for an attorney (the money lands on
   * the attorney's own balance; the platform keeps only its fee). */
  createConnectAccount?(input: {
    userId: string;
    email: string | null;
    country: string;
  }): Promise<string>;
  /** Stripe-hosted onboarding (KYC, bank account); short-lived URL. */
  createAccountOnboardingLink?(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<string>;
  /** The Express dashboard (payouts, balance) — short-lived URL. */
  createAccountLoginLink?(accountId: string): Promise<string>;
  retrieveConnectAccount?(
    accountId: string,
  ): Promise<ProviderConnectAccount | null>;
  /** Owner 2026-10-05 (anti-fraud): hold the attorney's payouts for
   * [days] until the trust check clears them (`null` = Stripe default). */
  updateConnectPayoutDelay?(
    accountId: string,
    days: number | null,
  ): Promise<void>;
  /** A hosted checkout charged on the connected account (direct charge)
   * with the platform's `application_fee_amount`. */
  createConnectedCheckout?(
    input: ProviderConnectedCheckoutInput,
  ): Promise<{ id: string; url: string }>;
  retrieveConnectedCheckout?(
    accountId: string,
    sessionId: string,
  ): Promise<ProviderConnectedCheckout | null>;
  /** Refund part or all of a connected-account charge; the platform fee
   * is given back pro rata when [refundApplicationFee]. */
  refundConnected?(input: {
    accountId: string;
    paymentIntentId: string;
    amountCents: number;
    refundApplicationFee: boolean;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<ProviderRefund>;
  /** Owner 2026-10-05: the client as a customer on the attorney's account
   * so Checkout can save and reuse their card for that attorney. */
  ensureConnectedCustomer?(input: {
    accountId: string;
    email: string | null;
    name: string | null;
    metadata: Record<string, string>;
  }): Promise<string>;
  /** The charge behind a connected payment (receipt, refunds, dispute). */
  retrieveConnectedCharge?(
    accountId: string,
    chargeId: string,
  ): Promise<ProviderConnectedCharge | null>;
  /** Stripe robustness 2026-10-27: close an unpaid connected checkout on
   * Stripe's side (so a late payment becomes impossible). Returns the
   * session as Stripe has it now (a paid one stays `complete`). */
  expireConnectedCheckout?(
    accountId: string,
    sessionId: string,
  ): Promise<ProviderConnectedCheckout | null>;
  /** A dispute on a connected (or, with [accountId] null, the platform)
   * account as Stripe has it. */
  retrieveDispute?(
    accountId: string | null,
    disputeId: string,
  ): Promise<ProviderDispute | null>;
  /** Saves evidence on a dispute: as a DRAFT, or submitted when [submit]. */
  updateDisputeEvidence?(input: {
    accountId: string | null;
    disputeId: string;
    evidence: Record<string, string>;
    submit: boolean;
  }): Promise<ProviderDispute>;
  /** Uploads a file for dispute evidence (purpose dispute_evidence). */
  uploadEvidenceFile?(input: {
    accountId: string | null;
    filename: string;
    mime: string;
    data: Buffer;
  }): Promise<string>;
  /** Stripe payout schedule of a connected account: manual = paused. */
  setConnectPayoutsHeld?(
    accountId: string,
    held: boolean,
    restoreDelayDays: number | null,
  ): Promise<void>;
  /** The radar early fraud warning behind a webhook, as Stripe has it. */
  retrieveEarlyFraudWarning?(
    accountId: string | null,
    id: string,
  ): Promise<ProviderEarlyFraudWarning | null>;
  /** One refund of a connected account as Stripe has it. */
  retrieveConnectedRefund?(
    accountId: string,
    refundId: string,
  ): Promise<ProviderRefund | null>;
}

export interface ProviderDispute {
  id: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  status: string;
  reason: string;
  amountCents: number;
  currency: string;
  /** Unix seconds; null when Stripe has no deadline (closed). */
  dueBy: number | null;
  hasEvidence: boolean;
  pastDue: boolean;
  submissionCount: number;
}

export interface ProviderEarlyFraudWarning {
  id: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  fraudType: string;
  actionable: boolean;
}

export interface ProviderConnectAccount {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Stripe `requirements.currently_due` (+ past_due). */
  requirementsDue: string[];
  disabledReason: string | null;
  country: string | null;
  // Owner 2026-10-05 (anti-fraud): who stands behind the account, for the
  // trust check of the legal name against the profile and the bar registry.
  /** `business_type`: individual | company | non_profit | government_entity. */
  businessType?: string | null;
  /** individual accounts: `individual.first_name` / `last_name`. */
  legalFirstName?: string | null;
  legalLastName?: string | null;
  /** company accounts: `company.name` and `business_profile.url`. */
  companyName?: string | null;
  companyUrl?: string | null;
  /** company accounts: representative + owners / executives. */
  people?: ProviderConnectPerson[];
}

export interface ProviderConnectPerson {
  firstName: string | null;
  lastName: string | null;
  /** representative | owner | executive | director. */
  role: string | null;
}

export interface ProviderConnectedCheckoutInput {
  accountId: string;
  customerEmail?: string | null;
  /** A customer on the connected account (saved cards). */
  customerId?: string | null;
  /** Offer to save the card for next time (needs customerId). */
  saveCard?: boolean;
  /** What the client pays. */
  amountCents: number;
  /** The platform's share, moved to the platform balance by Stripe. */
  applicationFeeCents: number;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}

export interface ProviderConnectedCheckout {
  id: string;
  accountId: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  amountTotalCents: number | null;
  metadata: Record<string, string>;
}

export interface ProviderConnectedCharge {
  id: string;
  paymentIntentId: string | null;
  amountCents: number;
  amountRefundedCents: number;
  refunded: boolean;
  receiptUrl: string | null;
  disputed: boolean;
  /** Stripe dispute status when disputed (needs_response, won, lost…). */
  disputeStatus: string | null;
}

export interface ProviderOneTimeCheckoutInput {
  customerEmail?: string | null;
  amountCents: number;
  description: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
  /** Owner 2026-10-22: Stripe Tax (the hosted page collects the address). */
  automaticTax?: boolean;
}

/** Owner 2026-10-22: a one-time payment on our own card page. */
export interface ProviderPaymentIntentInput {
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
  receiptEmail?: string | null;
  idempotencyKey: string;
}

/** Metadata keys a PaymentIntent carries when Stripe Tax was computed
 * for it (read by the webhook to record the tax transaction). */
export const PI_TAX_CALCULATION_KEY = 'taxCalculationId';
export const PI_TAX_CENTS_KEY = 'taxCents';

export interface ProviderPaymentIntent {
  id: string;
  /** Stripe's status: requires_payment_method, requires_action,
   * processing, succeeded, canceled, … */
  status: string;
  amountCents: number;
  currency: string;
  clientSecret: string | null;
  metadata: Record<string, string>;
}

/** A PaymentIntent in the shape the checkout appliers read. */
export function paymentIntentAsCheckout(
  pi: ProviderPaymentIntent,
): ProviderCheckoutSession {
  const paid = pi.status === 'succeeded';
  return {
    id: pi.id,
    url: null,
    status: paid ? 'complete' : 'open',
    customerId: null,
    subscriptionId: null,
    metadata: pi.metadata,
    paymentIntentId: pi.id,
    amountTotalCents: pi.amountCents,
    paymentStatus: paid ? 'paid' : 'unpaid',
  };
}

/** Ids of PaymentIntents (Stripe's and the fake provider's). */
export function isPaymentIntentId(id: string | null | undefined): boolean {
  return !!id && /^(pi_|fake_pi_)/.test(id);
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

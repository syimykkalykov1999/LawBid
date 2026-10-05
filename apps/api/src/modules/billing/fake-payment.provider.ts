import { randomUUID } from 'node:crypto';
import {
  type PaymentProvider,
  type ProviderCharge,
  type ProviderCheckoutSession,
  type ProviderConnectAccount,
  type ProviderConnectedCharge,
  type ProviderConnectedCheckout,
  type ProviderConnectedCheckoutInput,
  type ProviderCoupon,
  type ProviderCouponInput,
  type ProviderEvent,
  type ProviderRefund,
  type ProviderInvoice,
  type ProviderOneTimeCheckoutInput,
  type ProviderPrice,
  type ProviderPriceInput,
  type ProviderSetupIntent,
  type ProviderSubscription,
  WebhookSignatureError,
} from './payment-provider';

/** A card test suites can bind to a fake setup intent. */
export interface FakeCard {
  paymentMethodId: string;
  fingerprint: string;
}

/**
 * In-memory stand-in for Stripe when STRIPE_SECRET_KEY is absent (dev,
 * e2e). Objects live in maps; a "webhook" is a JSON body with
 * `Stripe-Signature: fake` whose `data.object` is upserted into the maps
 * when its `_version` is not older than the stored one — so the handler's
 * re-read returns the newest state even when events arrive out of order,
 * exactly like re-fetching from Stripe.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  readonly mode = 'fake' as const;
  readonly customers = new Map<string, { id: string; userId: string }>();
  readonly setupIntents = new Map<string, ProviderSetupIntent>();
  readonly cards = new Map<string, FakeCard>();
  readonly subscriptions = new Map<
    string,
    ProviderSubscription & { _version: number }
  >();
  readonly invoices = new Map<string, ProviderInvoice & { _version: number }>();
  readonly charges = new Map<string, ProviderCharge>();
  readonly checkouts = new Map<
    string,
    ProviderCheckoutSession & {
      lineItems: { priceId: string; quantity: number }[];
      trialDays: number | null;
      successUrl: string;
      couponId: string | null;
    }
  >();
  /** Owner 2026-10-02: coupons (admin promo codes) and refunds. */
  readonly coupons = new Map<string, ProviderCouponInput>();
  readonly refunds = new Map<
    string,
    { paymentIntentId: string; amountCents: number }
  >();
  /** Owner 2026-10-02: one-time checkouts (case promotion) and customer
   * balance credits (referral rewards). */
  readonly oneTimeCheckouts = new Map<
    string,
    ProviderCheckoutSession & { successUrl: string }
  >();
  readonly balanceCredits = new Map<
    string,
    { customerId: string; cents: number; description: string }
  >();

  createOneTimeCheckout(
    input: ProviderOneTimeCheckoutInput,
  ): Promise<{ id: string; url: string }> {
    const id = `cs_fake_${randomUUID().slice(0, 12)}`;
    const url = `${this.checkoutBaseUrl}/${id}`;
    this.oneTimeCheckouts.set(id, {
      id,
      url,
      status: 'open',
      customerId: null,
      subscriptionId: null,
      metadata: input.metadata,
      paymentIntentId: null,
      amountTotalCents: input.amountCents,
      paymentStatus: 'unpaid',
      successUrl: input.successUrl,
    });
    return Promise.resolve({ id, url });
  }

  creditCustomerBalance(
    customerId: string,
    cents: number,
    description: string,
    idempotencyKey?: string,
  ): Promise<void> {
    this.balanceCredits.set(idempotencyKey ?? randomUUID(), {
      customerId,
      cents,
      description,
    });
    return Promise.resolve();
  }

  createCoupon(input: ProviderCouponInput): Promise<ProviderCoupon> {
    const couponId = `coupon_fake_${randomUUID().slice(0, 12)}`;
    this.coupons.set(couponId, input);
    return Promise.resolve({
      couponId,
      promotionCodeId: `promo_fake_${randomUUID().slice(0, 12)}`,
    });
  }

  deleteCoupon(couponId: string): Promise<void> {
    this.coupons.delete(couponId);
    return Promise.resolve();
  }

  refund(input: {
    paymentIntentId: string;
    amountCents: number;
  }): Promise<ProviderRefund> {
    const id = `re_fake_${randomUUID().slice(0, 12)}`;
    this.refunds.set(id, {
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
    });
    return Promise.resolve({ id, status: 'succeeded', failureReason: null });
  }
  /** Seat quantities set on fake subscriptions (OQ-048). */
  readonly seats = new Map<string, number>();

  setSeatQuantity(
    subscriptionId: string,
    _seatPriceId: string,
    quantity: number,
  ): Promise<ProviderSubscription> {
    const cur = this.subscriptions.get(subscriptionId);
    if (!cur) throw new Error('no such subscription');
    this.seats.set(subscriptionId, quantity);
    return Promise.resolve(strip(cur));
  }
  /** Owner 2026-10-03: prices created from the admin, and the item
   * moves (subscription → new price id) done by "move subscribers". */
  readonly prices = new Map<string, ProviderPriceInput>();
  readonly priceMoves = new Map<string, string>();

  createPrice(input: ProviderPriceInput): Promise<ProviderPrice> {
    const priceId = `price_fake_${input.metadata.kind ?? 'plan'}_${input.amountCents}_${randomUUID().slice(0, 6)}`;
    this.prices.set(priceId, input);
    return Promise.resolve({
      priceId,
      productId:
        input.productId ?? `prod_fake_${input.metadata.kind ?? 'plan'}`,
    });
  }

  replaceItemPrice(
    subscriptionId: string,
    _fromPriceIds: string[],
    toPriceId: string,
  ): Promise<ProviderSubscription | null> {
    const cur = this.subscriptions.get(subscriptionId);
    if (!cur) return Promise.resolve(null);
    this.priceMoves.set(subscriptionId, toPriceId);
    return Promise.resolve(strip(cur));
  }

  /** Fake subscriptions moved to the yearly plan → its price id. */
  readonly yearly = new Map<string, string>();

  switchToYearly(
    subscriptionId: string,
    yearlyPriceId: string,
  ): Promise<ProviderSubscription> {
    const cur = this.subscriptions.get(subscriptionId);
    if (!cur) throw new Error('no such subscription');
    this.seats.delete(subscriptionId);
    this.yearly.set(subscriptionId, yearlyPriceId);
    return Promise.resolve(strip(cur));
  }

  /** Where the dev "checkout page" lives (the API's own fake route). */
  checkoutBaseUrl = 'http://localhost:3000/api/v1/subscriptions/fake-checkout';

  endTrialNow(id: string): Promise<ProviderSubscription> {
    const cur = this.subscriptions.get(id);
    if (!cur) throw new Error('no such subscription');
    const now = Math.floor(Date.now() / 1000);
    const next = {
      ...cur,
      status: 'active' as const,
      trialEnd: now,
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 86_400,
      _version: cur._version + 1,
    };
    this.subscriptions.set(id, next);
    return Promise.resolve(strip(next));
  }

  createCheckoutSession(input: {
    customerId: string;
    lineItems: { priceId: string; quantity: number }[];
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    couponId?: string | null;
  }): Promise<ProviderCheckoutSession> {
    const id = `cs_fake_${randomUUID().slice(0, 12)}`;
    const s = {
      id,
      url: `${this.checkoutBaseUrl}/${id}`,
      status: 'open' as const,
      customerId: input.customerId,
      subscriptionId: null,
      metadata: input.metadata,
      lineItems: input.lineItems,
      trialDays: input.trialDays,
      successUrl: input.successUrl,
      couponId: input.couponId ?? null,
    };
    this.checkouts.set(id, s);
    return Promise.resolve(stripCheckout(s));
  }

  retrieveCheckoutSession(id: string): Promise<ProviderCheckoutSession | null> {
    const s = this.checkouts.get(id);
    if (!s) {
      const one = this.oneTimeCheckouts.get(id);
      if (one) {
        const { successUrl: _u, ...session } = one;
        void _u;
        return Promise.resolve(session);
      }
    }
    return Promise.resolve(s ? stripCheckout(s) : null);
  }

  /** What paying on the hosted page does: a card, a subscription, the
   * session complete. Returns the success URL. */
  async payCheckout(id: string, card?: FakeCard): Promise<string> {
    const one = this.oneTimeCheckouts.get(id);
    if (one) {
      this.completeOneTime(id);
      return one.successUrl;
    }
    const s = this.checkouts.get(id);
    if (!s) throw new Error('no such checkout session');
    if (s.status === 'complete') return s.successUrl;
    const c = card ?? {
      paymentMethodId: `pm_fake_${randomUUID().slice(0, 8)}`,
      fingerprint: `fp_${randomUUID().slice(0, 8)}`,
    };
    this.cards.set(c.paymentMethodId, c);
    const sub = await this.createSubscription({
      customerId: s.customerId ?? '',
      priceId: s.lineItems[0]?.priceId ?? 'price_fake',
      paymentMethodId: c.paymentMethodId,
      trialDays: s.trialDays,
      metadata: s.metadata,
    });
    this.checkouts.set(id, {
      ...s,
      status: 'complete',
      subscriptionId: sub.id,
    });
    return s.successUrl;
  }

  createCustomer(input: { userId: string }): Promise<string> {
    const id = `cus_fake_${randomUUID().slice(0, 12)}`;
    this.customers.set(id, { id, userId: input.userId });
    return Promise.resolve(id);
  }

  createSetupIntent(
    customerId: string,
  ): Promise<{ id: string; clientSecret: string }> {
    const id = `seti_fake_${randomUUID().slice(0, 12)}`;
    this.setupIntents.set(id, {
      id,
      customerId,
      status: 'requires_payment_method',
      paymentMethodId: null,
    });
    return Promise.resolve({ id, clientSecret: `${id}_secret_fake` });
  }

  /** What the PaymentSheet does in real life: binds a card. */
  confirmSetupIntent(id: string, card: FakeCard): void {
    const si = this.setupIntents.get(id);
    if (!si) throw new Error('no such setup intent');
    this.cards.set(card.paymentMethodId, card);
    this.setupIntents.set(id, {
      ...si,
      status: 'succeeded',
      paymentMethodId: card.paymentMethodId,
    });
  }

  retrieveSetupIntent(id: string): Promise<ProviderSetupIntent | null> {
    return Promise.resolve(this.setupIntents.get(id) ?? null);
  }

  paymentMethodFingerprint(paymentMethodId: string): Promise<string | null> {
    return Promise.resolve(
      this.cards.get(paymentMethodId)?.fingerprint ?? null,
    );
  }

  createSubscription(input: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    trialDays: number | null;
    metadata: Record<string, string>;
  }): Promise<ProviderSubscription> {
    const now = Math.floor(Date.now() / 1000);
    const month = 30 * 86_400;
    const sub = {
      id: `sub_fake_${randomUUID().slice(0, 12)}`,
      customerId: input.customerId,
      status: (input.trialDays
        ? 'trialing'
        : 'active') as ProviderSubscription['status'],
      trialStart: input.trialDays ? now : null,
      trialEnd: input.trialDays ? now + input.trialDays * 86_400 : null,
      currentPeriodStart: now,
      currentPeriodEnd: input.trialDays
        ? now + input.trialDays * 86_400
        : now + month,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      defaultPaymentMethodId: input.paymentMethodId,
      metadata: input.metadata,
      _version: 0,
    };
    this.subscriptions.set(sub.id, sub);
    return Promise.resolve(strip(sub));
  }

  retrieveSubscription(id: string): Promise<ProviderSubscription | null> {
    const s = this.subscriptions.get(id);
    return Promise.resolve(s ? strip(s) : null);
  }

  setCancelAtPeriodEnd(
    id: string,
    cancel: boolean,
  ): Promise<ProviderSubscription> {
    const s = this.must(id);
    const next = {
      ...s,
      cancelAtPeriodEnd: cancel,
      canceledAt: cancel ? Math.floor(Date.now() / 1000) : null,
    };
    this.subscriptions.set(id, next);
    return Promise.resolve(strip(next));
  }

  cancelNow(id: string): Promise<ProviderSubscription> {
    const s = this.must(id);
    const next = {
      ...s,
      status: 'canceled' as const,
      cancelAtPeriodEnd: false,
      canceledAt: Math.floor(Date.now() / 1000),
    };
    this.subscriptions.set(id, next);
    return Promise.resolve(strip(next));
  }

  extendUntil(id: string, untilUnix: number): Promise<ProviderSubscription> {
    const s = this.must(id);
    const next = {
      ...s,
      status: 'trialing' as const,
      trialEnd: untilUnix,
      currentPeriodEnd: untilUnix,
    };
    this.subscriptions.set(id, next);
    return Promise.resolve(strip(next));
  }

  createPortalSession(customerId: string, returnUrl: string): Promise<string> {
    return Promise.resolve(
      `https://billing.fake.local/portal/${customerId}?return_url=${encodeURIComponent(returnUrl)}`,
    );
  }

  retrieveInvoice(id: string): Promise<ProviderInvoice | null> {
    const i = this.invoices.get(id);
    return Promise.resolve(i ? strip(i) : null);
  }

  retrieveCharge(id: string): Promise<ProviderCharge | null> {
    return Promise.resolve(this.charges.get(id) ?? null);
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
    options: { connect?: boolean } = {},
  ): ProviderEvent {
    if (signature !== 'fake')
      throw new WebhookSignatureError('Expected Stripe-Signature: fake');
    let parsed: {
      id?: string;
      type?: string;
      created?: number;
      data?: { object?: Record<string, unknown> };
    };
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as typeof parsed;
    } catch {
      throw new WebhookSignatureError('Body is not JSON');
    }
    const object = parsed.data?.object;
    if (
      !parsed.id ||
      !parsed.type ||
      !object ||
      typeof object.id !== 'string'
    ) {
      throw new WebhookSignatureError('Malformed event');
    }
    this.absorb(object);
    // Owner 2026-10-05: a Connect event names its connected account.
    const account = (parsed as { account?: string }).account;
    if (options.connect && account) object._account = account;
    return {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created ?? Math.floor(Date.now() / 1000),
      object: object as ProviderEvent['object'],
    };
  }

  dashboardUrl(): null {
    return null;
  }

  // ---- Stripe Connect (owner 2026-10-05) ----------------------------------

  readonly connectAccounts = new Map<
    string,
    ProviderConnectAccount & { userId: string }
  >();
  readonly connectedCheckouts = new Map<
    string,
    ProviderConnectedCheckout & {
      customerId?: string | null;
      successUrl: string;
      applicationFeeCents: number;
    }
  >();
  readonly connectedCharges = new Map<
    string,
    ProviderConnectedCharge & { accountId: string }
  >();
  readonly connectedRefunds = new Map<
    string,
    {
      accountId: string;
      paymentIntentId: string;
      amountCents: number;
      refundApplicationFee: boolean;
    }
  >();

  createConnectAccount(input: {
    userId: string;
    email: string | null;
    country: string;
  }): Promise<string> {
    const id = `acct_fake_${randomUUID().slice(0, 12)}`;
    this.connectAccounts.set(id, {
      id,
      userId: input.userId,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: ['external_account', 'individual.verification.document'],
      disabledReason: null,
      country: input.country,
    });
    return Promise.resolve(id);
  }

  createAccountOnboardingLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<string> {
    if (!this.connectAccounts.has(input.accountId))
      throw new Error('no such connected account');
    return Promise.resolve(
      `${this.checkoutBaseUrl}/connect/${input.accountId}?return=${encodeURIComponent(input.returnUrl)}`,
    );
  }

  createAccountLoginLink(accountId: string): Promise<string> {
    if (!this.connectAccounts.has(accountId))
      throw new Error('no such connected account');
    return Promise.resolve(`https://connect.stripe.com/fake/${accountId}`);
  }

  retrieveConnectAccount(
    accountId: string,
  ): Promise<ProviderConnectAccount | null> {
    const a = this.connectAccounts.get(accountId);
    if (!a) return Promise.resolve(null);
    const { userId: _u, ...rest } = a;
    void _u;
    return Promise.resolve(rest);
  }

  /** Owner 2026-10-05 (anti-fraud): payout delays asked of "Stripe". */
  readonly payoutDelays = new Map<string, number | null>();

  updateConnectPayoutDelay(
    accountId: string,
    days: number | null,
  ): Promise<void> {
    if (!this.connectAccounts.has(accountId)) {
      return Promise.reject(new Error('no such connected account'));
    }
    this.payoutDelays.set(accountId, days);
    return Promise.resolve();
  }

  /** What finishing Stripe's onboarding does (dev page / e2e). */
  completeConnectOnboarding(accountId: string): void {
    const a = this.connectAccounts.get(accountId);
    if (!a) throw new Error('no such connected account');
    this.connectAccounts.set(accountId, {
      ...a,
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: [],
      disabledReason: null,
    });
  }

  createConnectedCheckout(
    input: ProviderConnectedCheckoutInput,
  ): Promise<{ id: string; url: string }> {
    if (!this.connectAccounts.has(input.accountId))
      throw new Error('no such connected account');
    const id = `cs_fake_${randomUUID().slice(0, 12)}`;
    const url = `${this.checkoutBaseUrl}/${id}`;
    this.connectedCheckouts.set(id, {
      id,
      accountId: input.accountId,
      url,
      status: 'open',
      paymentStatus: 'unpaid',
      paymentIntentId: null,
      chargeId: null,
      receiptUrl: null,
      amountTotalCents: input.amountCents,
      metadata: input.metadata,
      successUrl: input.successUrl,
      applicationFeeCents: input.applicationFeeCents,
      customerId: input.customerId ?? null,
    });
    return Promise.resolve({ id, url });
  }

  /** Customers created on connected accounts (saved cards), for tests. */
  readonly connectedCustomers: { accountId: string; id: string }[] = [];

  ensureConnectedCustomer(input: {
    accountId: string;
    email: string | null;
  }): Promise<string> {
    if (!this.connectAccounts.has(input.accountId))
      throw new Error('no such connected account');
    const id = `cus_fake_${randomUUID().slice(0, 12)}`;
    this.connectedCustomers.push({ accountId: input.accountId, id });
    return Promise.resolve(id);
  }

  retrieveConnectedCheckout(
    accountId: string,
    sessionId: string,
  ): Promise<ProviderConnectedCheckout | null> {
    const s = this.connectedCheckouts.get(sessionId);
    if (!s || s.accountId !== accountId) return Promise.resolve(null);
    const { successUrl: _u, applicationFeeCents: _f, ...rest } = s;
    void _u;
    void _f;
    return Promise.resolve(rest);
  }

  /** Dev checkout page: a connected checkout by its id alone. */
  connectedCheckoutById(sessionId: string): ProviderConnectedCheckout | null {
    const s = this.connectedCheckouts.get(sessionId);
    if (!s) return null;
    const { successUrl: _u, applicationFeeCents: _f, ...rest } = s;
    void _u;
    void _f;
    return rest;
  }

  /** Paying a connected checkout on the dev page / in e2e: a payment
   * intent, a charge with a receipt, the session complete. Returns the
   * success URL. */
  payConnectedCheckout(sessionId: string): string {
    const s = this.connectedCheckouts.get(sessionId);
    if (!s) throw new Error('no such connected checkout');
    if (s.status === 'complete') return s.successUrl;
    const pi = `pi_fake_${randomUUID().slice(0, 12)}`;
    const ch = `ch_fake_${randomUUID().slice(0, 12)}`;
    this.connectedCharges.set(ch, {
      id: ch,
      accountId: s.accountId,
      paymentIntentId: pi,
      amountCents: s.amountTotalCents ?? 0,
      amountRefundedCents: 0,
      refunded: false,
      receiptUrl: `https://pay.stripe.com/receipts/fake/${ch}`,
      disputed: false,
      disputeStatus: null,
    });
    this.connectedCheckouts.set(sessionId, {
      ...s,
      status: 'complete',
      paymentStatus: 'paid',
      paymentIntentId: pi,
      chargeId: ch,
      receiptUrl: `https://pay.stripe.com/receipts/fake/${ch}`,
    });
    return s.successUrl;
  }

  refundConnected(input: {
    accountId: string;
    paymentIntentId: string;
    amountCents: number;
    refundApplicationFee: boolean;
    idempotencyKey: string;
  }): Promise<ProviderRefund> {
    const id = `re_fake_${randomUUID().slice(0, 12)}`;
    this.connectedRefunds.set(id, {
      accountId: input.accountId,
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
      refundApplicationFee: input.refundApplicationFee,
    });
    for (const [chId, ch] of this.connectedCharges) {
      if (ch.paymentIntentId === input.paymentIntentId) {
        const refunded = ch.amountRefundedCents + input.amountCents;
        this.connectedCharges.set(chId, {
          ...ch,
          amountRefundedCents: refunded,
          refunded: refunded >= ch.amountCents,
        });
      }
    }
    return Promise.resolve({ id, status: 'succeeded', failureReason: null });
  }

  retrieveConnectedCharge(
    accountId: string,
    chargeId: string,
  ): Promise<ProviderConnectedCharge | null> {
    const ch = this.connectedCharges.get(chargeId);
    if (!ch || ch.accountId !== accountId) return Promise.resolve(null);
    const { accountId: _a, ...rest } = ch;
    void _a;
    return Promise.resolve(rest);
  }

  /** Upsert an event's object unless a newer version is already stored. */
  private absorb(object: Record<string, unknown>): void {
    const version = typeof object._version === 'number' ? object._version : 0;
    const id = object.id as string;
    if (object.object === 'subscription') {
      const cur = this.subscriptions.get(id);
      if (cur && cur._version > version) return;
      this.subscriptions.set(id, {
        id,
        customerId: (object.customer as string) ?? cur?.customerId ?? '',
        status:
          (object.status as ProviderSubscription['status']) ??
          cur?.status ??
          'active',
        trialStart:
          (object.trial_start as number | null) ?? cur?.trialStart ?? null,
        trialEnd: (object.trial_end as number | null) ?? cur?.trialEnd ?? null,
        currentPeriodStart:
          (object.current_period_start as number | null) ??
          cur?.currentPeriodStart ??
          null,
        currentPeriodEnd:
          (object.current_period_end as number | null) ??
          cur?.currentPeriodEnd ??
          null,
        cancelAtPeriodEnd:
          (object.cancel_at_period_end as boolean | undefined) ??
          cur?.cancelAtPeriodEnd ??
          false,
        canceledAt:
          (object.canceled_at as number | null) ?? cur?.canceledAt ?? null,
        defaultPaymentMethodId:
          (object.default_payment_method as string | null) ??
          cur?.defaultPaymentMethodId ??
          null,
        metadata:
          (object.metadata as Record<string, string>) ?? cur?.metadata ?? {},
        _version: version,
      });
    } else if (object.object === 'invoice') {
      const cur = this.invoices.get(id);
      if (cur && cur._version > version) return;
      this.invoices.set(id, {
        id,
        customerId:
          (object.customer as string | null) ?? cur?.customerId ?? null,
        subscriptionId:
          (object.subscription as string | null) ?? cur?.subscriptionId ?? null,
        amountCents:
          (object.amount_paid as number) ??
          (object.amount_due as number) ??
          cur?.amountCents ??
          0,
        currency: (object.currency as string) ?? 'usd',
        status:
          (object.status as ProviderInvoice['status']) ?? cur?.status ?? 'open',
        paidAt: (object.paid_at as number | null) ?? cur?.paidAt ?? null,
        paymentIntentId:
          (object.payment_intent as string | null) ??
          cur?.paymentIntentId ??
          null,
        failureCode: (object.failure_code as string | null) ?? null,
        _version: version,
      });
    } else if (
      object.object === 'checkout.session' &&
      object.status === 'complete'
    ) {
      if (this.connectedCheckouts.has(id)) this.payConnectedCheckout(id);
      else this.completeOneTime(id);
    } else if (object.object === 'account') {
      // Owner 2026-10-05: `account.updated` of a connected account.
      const cur = this.connectAccounts.get(id);
      if (cur) {
        this.connectAccounts.set(id, {
          ...cur,
          chargesEnabled:
            (object.charges_enabled as boolean | undefined) ??
            cur.chargesEnabled,
          payoutsEnabled:
            (object.payouts_enabled as boolean | undefined) ??
            cur.payoutsEnabled,
          detailsSubmitted:
            (object.details_submitted as boolean | undefined) ??
            cur.detailsSubmitted,
          requirementsDue:
            (object.requirements as { currently_due?: string[] } | undefined)
              ?.currently_due ?? cur.requirementsDue,
          disabledReason:
            ((object.requirements as { disabled_reason?: string } | undefined)
              ?.disabled_reason as string | null | undefined) ??
            cur.disabledReason,
        });
      }
    } else if (object.object === 'dispute') {
      const chId = object.charge as string | undefined;
      const ch = chId ? this.connectedCharges.get(chId) : undefined;
      if (ch) {
        const status =
          (object.status as string | undefined) ?? 'needs_response';
        this.connectedCharges.set(ch.id, {
          ...ch,
          disputed: true,
          disputeStatus: status,
          ...(status === 'lost'
            ? { refunded: true, amountRefundedCents: ch.amountCents }
            : {}),
        });
      }
    } else if (object.object === 'charge') {
      this.charges.set(id, {
        id,
        paymentIntentId: (object.payment_intent as string | null) ?? null,
        refunded: Boolean(object.refunded),
        amountRefundedCents: (object.amount_refunded as number) ?? 0,
      });
    }
  }

  /** A one-time session paid (owner 2026-10-02, case promotion). */
  private completeOneTime(id: string): void {
    const one = this.oneTimeCheckouts.get(id);
    if (!one || one.status === 'complete') return;
    this.oneTimeCheckouts.set(id, {
      ...one,
      status: 'complete',
      paymentStatus: 'paid',
      paymentIntentId: `pi_fake_${randomUUID().slice(0, 12)}`,
    });
  }

  private must(id: string) {
    const s = this.subscriptions.get(id);
    if (!s) throw new Error(`no such subscription ${id}`);
    return s;
  }
}

function strip<T extends { _version: number }>(o: T): Omit<T, '_version'> {
  const { _version: _v, ...rest } = o;
  void _v;
  return rest;
}

function stripCheckout(s: ProviderCheckoutSession): ProviderCheckoutSession {
  return {
    id: s.id,
    url: s.url,
    status: s.status,
    customerId: s.customerId,
    subscriptionId: s.subscriptionId,
    metadata: s.metadata,
  };
}

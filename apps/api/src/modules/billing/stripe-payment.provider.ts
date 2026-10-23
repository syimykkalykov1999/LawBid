import Stripe from 'stripe';
import {
  type PaymentProvider,
  type ProviderCharge,
  type ProviderCheckoutSession,
  type ProviderConnectAccount,
  type ProviderConnectPerson,
  type ProviderConnectedCharge,
  type ProviderConnectedCheckout,
  type ProviderConnectedCheckoutInput,
  type ProviderCoupon,
  type ProviderCouponInput,
  type ProviderEvent,
  type ProviderRefund,
  type ProviderInvoice,
  type ProviderSeatCharge,
  type ProviderSeatItemInput,
  type ProviderSeatPreview,
  type ProviderOneTimeCheckoutInput,
  type ProviderPaymentIntent,
  type ProviderPaymentIntentInput,
  type ProviderPrice,
  type ProviderPriceInput,
  type ProviderSetupIntent,
  type ProviderSubscription,
  type ProviderTaxCalculation,
  type ProviderTaxLocation,
  WebhookSignatureError,
} from './payment-provider';
import { demoDenyProxy } from '../../common/demo/demo-guards';

/**
 * docs/06 §1.4–1.6 over the official SDK. Period boundaries are read from
 * the subscription item (where recent API versions keep them) with the
 * legacy top-level fields as a fallback.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;
  private readonly live: boolean;

  get mode(): 'test' | 'live' {
    return this.live ? 'live' : 'test';
  }

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
    /** Owner 2026-10-05: the Connect endpoint's own signing secret
     * (events of connected accounts); falls back to [webhookSecret]. */
    private readonly connectWebhookSecret?: string,
  ) {
    // Demo accounts can never reach Stripe (src/common/demo).
    this.stripe = demoDenyProxy(
      new Stripe(secretKey, {
        typescript: true,
        maxNetworkRetries: 2,
        // A hung Stripe call fails in seconds, not minutes: the admin sees a
        // clear "check the Stripe key" instead of a timed-out request.
        timeout: 20_000,
      }),
      'Payments',
    );
    this.live = /^(sk|rk)_live_/.test(secretKey);
  }

  async createCustomer(input: {
    userId: string;
    email: string | null;
    tax?: ProviderTaxLocation | null;
  }): Promise<string> {
    const c = await this.stripe.customers.create(
      {
        ...(input.email ? { email: input.email } : {}),
        metadata: { userId: input.userId },
        ...taxLocationParams(input.tax ?? null),
      },
      { idempotencyKey: `customer:${input.userId}` },
    );
    return c.id;
  }

  // ---- Owner 2026-10-22: Stripe Tax ----------------------------------

  /** The buyer's billing address and/or IP on the customer, so
   * `automatic_tax` can place them (Stripe needs one of the two). */
  async updateCustomerTaxLocation(
    customerId: string,
    location: ProviderTaxLocation,
  ): Promise<void> {
    const params = taxLocationParams(location);
    if (Object.keys(params).length === 0) return;
    await this.stripe.customers.update(customerId, params);
  }

  /** `customer.tax.automatic_tax === 'supported'`: Stripe knows where the
   * customer is and collects there. Anything else = keep automatic tax
   * off for this customer (Stripe would refuse the subscription). */
  async customerTaxSupported(customerId: string): Promise<boolean> {
    try {
      const c = await this.stripe.customers.retrieve(customerId);
      if (c.deleted) return false;
      return c.tax?.automatic_tax === 'supported';
    } catch {
      return false;
    }
  }

  /** Tax for a one-time amount on our own card page (Tax Calculation
   * API). The calculation lives 90 days; the webhook turns it into a tax
   * transaction once the intent succeeded. */
  async calculateTax(input: {
    amountCents: number;
    currency: string;
    reference: string;
    customerId?: string | null;
    location: ProviderTaxLocation;
  }): Promise<ProviderTaxCalculation> {
    const address = input.location.address ?? null;
    const calc = await this.stripe.tax.calculations.create({
      currency: input.currency,
      line_items: [
        {
          amount: input.amountCents,
          reference: input.reference,
          tax_behavior: 'exclusive',
        },
      ],
      ...(input.customerId && !address && !input.location.ip
        ? { customer: input.customerId }
        : {
            customer_details: {
              ...(address
                ? {
                    address: {
                      country: address.country,
                      ...(address.postalCode
                        ? { postal_code: address.postalCode }
                        : {}),
                      ...(address.state ? { state: address.state } : {}),
                      ...(address.city ? { city: address.city } : {}),
                      ...(address.line1 ? { line1: address.line1 } : {}),
                    },
                    address_source: 'billing' as const,
                  }
                : {}),
              ...(input.location.ip ? { ip_address: input.location.ip } : {}),
            },
          }),
    });
    const taxCents = calc.tax_amount_exclusive ?? 0;
    return {
      calculationId: calc.id ?? '',
      subtotalCents: input.amountCents,
      taxCents,
      totalCents: calc.amount_total ?? input.amountCents + taxCents,
      currency: calc.currency ?? input.currency,
    };
  }

  async recordTaxTransaction(
    calculationId: string,
    reference: string,
  ): Promise<string> {
    const t = await this.stripe.tax.transactions.createFromCalculation(
      { calculation: calculationId, reference },
      { idempotencyKey: `tax-tx:${reference}` },
    );
    return t.id;
  }

  async updatePaymentIntent(
    id: string,
    patch: { amountCents: number; metadata: Record<string, string> },
  ): Promise<ProviderPaymentIntent> {
    return mapPaymentIntent(
      await this.stripe.paymentIntents.update(id, {
        amount: patch.amountCents,
        metadata: patch.metadata,
      }),
    );
  }

  /** `automatic_tax` only when asked AND the customer can be placed. */
  private async automaticTaxFor(
    customerId: string,
    wanted: boolean | undefined,
  ): Promise<{ automatic_tax: { enabled: true } } | Record<string, never>> {
    if (!wanted) return {};
    return (await this.customerTaxSupported(customerId))
      ? { automatic_tax: { enabled: true } }
      : {};
  }

  async createSetupIntent(
    customerId: string,
    metadata?: Record<string, string>,
  ): Promise<{ id: string; clientSecret: string }> {
    const si = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      ...(metadata ? { metadata } : {}),
    });
    return { id: si.id, clientSecret: si.client_secret ?? '' };
  }

  async retrieveSetupIntent(id: string): Promise<ProviderSetupIntent | null> {
    try {
      const si = await this.stripe.setupIntents.retrieve(id);
      return {
        id: si.id,
        customerId:
          typeof si.customer === 'string'
            ? si.customer
            : (si.customer?.id ?? null),
        status: si.status,
        paymentMethodId:
          typeof si.payment_method === 'string'
            ? si.payment_method
            : (si.payment_method?.id ?? null),
        metadata: si.metadata ?? {},
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async paymentMethodFingerprint(
    paymentMethodId: string,
  ): Promise<string | null> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    return pm.card?.fingerprint ?? null;
  }

  async createSubscription(input: {
    customerId: string;
    priceId: string;
    lineItems?: { priceId: string; quantity: number }[];
    couponId?: string | null;
    paymentMethodId: string;
    trialDays: number | null;
    metadata: Record<string, string>;
    idempotencyKey: string;
    automaticTax?: boolean;
  }): Promise<ProviderSubscription> {
    const tax = await this.automaticTaxFor(
      input.customerId,
      input.automaticTax,
    );
    const sub = await this.stripe.subscriptions.create(
      {
        customer: input.customerId,
        ...tax,
        items: input.lineItems?.length
          ? input.lineItems.map((l) => ({
              price: l.priceId,
              quantity: l.quantity,
            }))
          : [{ price: input.priceId }],
        ...(input.couponId ? { discounts: [{ coupon: input.couponId }] } : {}),
        default_payment_method: input.paymentMethodId,
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        payment_settings: { save_default_payment_method: 'on_subscription' },
        // §1.3: a trial that can't be charged ends up `unpaid` → expired.
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: input.metadata,
      },
      {
        // Audit #15 (2026-10-22): one key per client attempt, not per hour
        // — a retry that crossed the hour used to create a second
        // subscription. Stripe replays a key for 24 h.
        idempotencyKey: `subscription:${input.metadata.userId}:${input.idempotencyKey}`,
      },
    );
    return mapSubscription(sub);
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription | null> {
    try {
      return mapSubscription(await this.stripe.subscriptions.retrieve(id));
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async setCancelAtPeriodEnd(
    id: string,
    cancel: boolean,
  ): Promise<ProviderSubscription> {
    return mapSubscription(
      await this.stripe.subscriptions.update(id, {
        cancel_at_period_end: cancel,
      }),
    );
  }

  async cancelNow(id: string): Promise<ProviderSubscription> {
    return mapSubscription(await this.stripe.subscriptions.cancel(id));
  }

  async extendUntil(
    id: string,
    untilUnix: number,
  ): Promise<ProviderSubscription> {
    return mapSubscription(
      await this.stripe.subscriptions.update(id, {
        trial_end: untilUnix,
        proration_behavior: 'none',
      }),
    );
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<string> {
    const s = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return s.url;
  }

  async setSeatQuantity(
    subscriptionId: string,
    seatPriceId: string,
    quantity: number,
    knownSeatPriceIds: string[] = [],
    prorationBehavior: 'none' | 'create_prorations' = 'create_prorations',
  ): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const item = seatItemOf(sub, seatPriceId, knownSeatPriceIds);
    const items: Stripe.SubscriptionUpdateParams.Item[] = item
      ? quantity > 0
        ? [{ id: item.id, quantity }]
        : [{ id: item.id, deleted: true }]
      : quantity > 0
        ? [{ price: seatPriceId, quantity }]
        : [];
    return mapSubscription(
      await this.stripe.subscriptions.update(subscriptionId, {
        items,
        proration_behavior: prorationBehavior,
      }),
    );
  }

  /**
   * Owner 2026-10-22: «К оплате сейчас» — Stripe's own preview of the
   * invoice the change creates at once (`always_invoice`), computed at
   * [prorationDate] so the purchase charges exactly what was shown
   * (docs.stripe.com/billing/subscriptions/prorations#preview-proration).
   */
  async previewSeatIncrease(
    input: ProviderSeatItemInput & {
      addSeats: number;
      prorationDate: number;
      automaticTax?: boolean;
    },
  ): Promise<ProviderSeatPreview> {
    const sub = await this.stripe.subscriptions.retrieve(input.subscriptionId);
    const item = seatItemOf(sub, input.seatPriceId, input.knownSeatPriceIds);
    const quantity = (item?.quantity ?? 0) + input.addSeats;
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const tax = await this.automaticTaxFor(customerId, input.automaticTax);
    const inv = await this.stripe.invoices.createPreview({
      customer: customerId,
      subscription: sub.id,
      ...tax,
      subscription_details: {
        items: item
          ? [{ id: item.id, quantity }]
          : [{ price: input.seatPriceId, quantity }],
        proration_behavior: 'always_invoice',
        proration_date: input.prorationDate,
      },
    });
    const lines = inv.lines?.data ?? [];
    const prorations = lines.filter(isProrationLine);
    // With always_invoice the preview IS the invoice charged now (only
    // proration lines); should Stripe ever return the renewal invoice
    // instead, only its proration lines are charged now.
    const amountNowCents =
      prorations.length > 0 && prorations.length < lines.length
        ? prorations.reduce((sum, l) => sum + l.amount, 0)
        : inv.amount_due;
    return {
      amountNowCents: Math.max(0, amountNowCents),
      taxCents: 'automatic_tax' in tax ? invoiceTaxCents(inv) : null,
      currency: inv.currency,
      prorationDate: input.prorationDate,
      periodEnd: mapSubscription(sub).currentPeriodEnd,
    };
  }

  /**
   * Owner 2026-10-22 (like Slack): the added seats are paid NOW — the
   * prorated rest of the period on its own invoice — and recur with the
   * monthly invoice after. `pending_if_incomplete`: Stripe applies the new
   * quantity only once that invoice is paid; a card that needs 3-D Secure
   * leaves the change pending (the app confirms the PaymentIntent), a
   * declined card voids the invoice so nothing changes
   * (docs.stripe.com/billing/subscriptions/pending-updates).
   */
  async chargeSeatIncrease(
    input: ProviderSeatItemInput & {
      quantity: number;
      prorationDate: number;
      idempotencyKey: string;
      automaticTax?: boolean;
    },
  ): Promise<ProviderSeatCharge> {
    const sub = await this.stripe.subscriptions.retrieve(input.subscriptionId);
    const item = seatItemOf(sub, input.seatPriceId, input.knownSeatPriceIds);
    const tax = await this.automaticTaxFor(
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      input.automaticTax,
    );
    const updated = await this.stripe.subscriptions.update(
      input.subscriptionId,
      {
        ...tax,
        items: item
          ? [{ id: item.id, quantity: input.quantity }]
          : [{ price: input.seatPriceId, quantity: input.quantity }],
        proration_behavior: 'always_invoice',
        proration_date: input.prorationDate,
        payment_behavior: 'pending_if_incomplete',
      },
      { idempotencyKey: input.idempotencyKey },
    );
    const mapped = mapSubscription(updated);
    const invoiceId = mapped.latestInvoiceId ?? null;
    const invoice = invoiceId
      ? await this.stripe.invoices.retrieve(invoiceId, {
          expand: ['confirmation_secret', 'payments'],
        })
      : null;
    const amountCents = invoice?.amount_due ?? 0;
    const currency = invoice?.currency ?? 'usd';
    if (!updated.pending_update || invoice?.status === 'paid') {
      return {
        status: 'applied',
        invoiceId,
        amountCents,
        currency,
        clientSecret: null,
        subscription: mapped,
      };
    }
    const intentId = paymentIntentOf(invoice);
    const intent = intentId
      ? await this.stripe.paymentIntents.retrieve(intentId)
      : null;
    if (
      intent &&
      (intent.status === 'requires_action' ||
        intent.status === 'requires_confirmation')
    ) {
      return {
        status: 'requires_action',
        invoiceId,
        amountCents,
        currency,
        clientSecret:
          intent.client_secret ??
          invoice?.confirmation_secret?.client_secret ??
          null,
        subscription: mapped,
      };
    }
    // Declined: drop the pending change now instead of leaving an open
    // invoice Stripe could still collect later.
    if (invoiceId) await this.voidInvoice(invoiceId);
    return {
      status: 'failed',
      invoiceId,
      amountCents,
      currency,
      clientSecret: null,
      subscription: mapped,
    };
  }

  async voidInvoice(invoiceId: string): Promise<void> {
    try {
      await this.stripe.invoices.voidInvoice(invoiceId);
    } catch (e) {
      // Already paid / voided: nothing to undo.
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
    }
  }

  async deleteCustomer(
    customerId: string,
    options: { stripeAccount?: string } = {},
  ): Promise<void> {
    try {
      await this.stripe.customers.del(
        customerId,
        {},
        options.stripeAccount
          ? { stripeAccount: options.stripeAccount }
          : undefined,
      );
    } catch (e) {
      // Owner 2026-10-22: already deleted (or never existed) = done.
      if (!isNotFound(e)) throw e;
    }
  }

  async switchToYearly(
    subscriptionId: string,
    yearlyPriceId: string,
    automaticTax?: boolean,
  ): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      ...sub.items.data.map((i) => ({ id: i.id, deleted: true })),
      { price: yearlyPriceId, quantity: 1 },
    ];
    const tax = await this.automaticTaxFor(
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      automaticTax,
    );
    return mapSubscription(
      await this.stripe.subscriptions.update(subscriptionId, {
        ...tax,
        items,
        proration_behavior: 'always_invoice',
      }),
    );
  }

  async createPrice(input: ProviderPriceInput): Promise<ProviderPrice> {
    let productId = input.productId;
    if (!productId && input.productFromPriceId) {
      try {
        const old = await this.stripe.prices.retrieve(input.productFromPriceId);
        productId =
          typeof old.product === 'string' ? old.product : old.product.id;
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }
    const price = await this.stripe.prices.create(
      {
        currency: input.currency,
        unit_amount: input.amountCents,
        recurring: { interval: input.interval },
        // Owner 2026-10-22 (Stripe Tax): the listed price is before tax;
        // automatic tax adds it on top (a price without tax_behavior
        // cannot be used with automatic_tax at all).
        tax_behavior: 'exclusive',
        metadata: input.metadata,
        ...(productId
          ? { product: productId }
          : {
              product_data: {
                name: input.productName,
                metadata: input.metadata,
              },
            }),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      priceId: price.id,
      productId:
        typeof price.product === 'string' ? price.product : price.product.id,
    };
  }

  async replaceItemPrice(
    subscriptionId: string,
    fromPriceIds: string[],
    toPriceId: string,
  ): Promise<ProviderSubscription | null> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const from = new Set(fromPriceIds);
    const items = sub.items.data
      .filter((i) => from.has(i.price.id) && i.price.id !== toPriceId)
      .map((i) => ({ id: i.id, price: toPriceId, quantity: i.quantity }));
    if (items.length === 0) return null;
    return mapSubscription(
      await this.stripe.subscriptions.update(subscriptionId, {
        items,
        proration_behavior: 'none',
      }),
    );
  }

  async endTrialNow(id: string): Promise<ProviderSubscription> {
    return mapSubscription(
      await this.stripe.subscriptions.update(id, { trial_end: 'now' }),
    );
  }

  async createCheckoutSession(input: {
    customerId: string;
    lineItems: { priceId: string; quantity: number }[];
    trialDays: number | null;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    couponId?: string | null;
    automaticTax?: boolean;
  }): Promise<ProviderCheckoutSession> {
    const s = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      // Owner 2026-10-22 (Stripe Tax): the hosted page asks for the
      // billing address, keeps it on the customer and adds the tax.
      ...(input.automaticTax
        ? {
            automatic_tax: { enabled: true },
            billing_address_collection: 'required' as const,
            customer_update: {
              address: 'auto' as const,
              name: 'auto' as const,
            },
          }
        : {}),
      line_items: input.lineItems.map((l) => ({
        price: l.priceId,
        quantity: l.quantity,
      })),
      payment_method_collection: 'always',
      // Owner 2026-10-16: a card and nothing else (no Link, wallets, bank
      // methods) and no promotion-code box: our promo codes live in the app.
      payment_method_types: ['card'],
      subscription_data: {
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        metadata: input.metadata,
      },
      metadata: input.metadata,
      client_reference_id: input.metadata.userId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Owner 2026-10-02: a fixed discount from our own promo code; owner
      // 2026-10-16: no promotion-code box on Stripe's page.
      ...(input.couponId ? { discounts: [{ coupon: input.couponId }] } : {}),
      // Our words under the button (logo and colours: Stripe Dashboard →
      // Settings → Branding).
      custom_text: {
        submit: {
          message:
            'LawBid Attorney subscription. Cancel anytime in the app → Subscription.',
        },
      },
    });
    return mapCheckout(s);
  }

  async retrieveCheckoutSession(
    id: string,
  ): Promise<ProviderCheckoutSession | null> {
    try {
      return mapCheckout(await this.stripe.checkout.sessions.retrieve(id));
    } catch {
      return null;
    }
  }

  /** Owner 2026-10-02 (referrals): negative balance = credit on the next
   * invoice. */
  async creditCustomerBalance(
    customerId: string,
    cents: number,
    description: string,
    idempotencyKey?: string,
  ): Promise<void> {
    await this.stripe.customers.createBalanceTransaction(
      customerId,
      { amount: -Math.abs(cents), currency: 'usd', description },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  /** Owner 2026-10-02 (case promotion): one-time hosted payment. */
  async createOneTimeCheckout(
    input: ProviderOneTimeCheckoutInput,
  ): Promise<{ id: string; url: string }> {
    const s = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Owner 2026-10-16: a card and nothing else.
        payment_method_types: ['card'],
        ...(input.automaticTax
          ? {
              automatic_tax: { enabled: true },
              billing_address_collection: 'required' as const,
            }
          : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: input.amountCents,
              product_data: { name: input.description },
              ...(input.automaticTax
                ? { tax_behavior: 'exclusive' as const }
                : {}),
            },
          },
        ],
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        metadata: input.metadata,
        payment_intent_data: { metadata: input.metadata },
        client_reference_id: input.metadata.userId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );
    return { id: s.id, url: s.url ?? '' };
  }

  /** Owner 2026-10-22: a one-time payment confirmed by Stripe.js on our
   * card page. `card` covers Apple Pay and Google Pay (wallet cards); no
   * Link, no bank methods. */
  async createPaymentIntent(
    input: ProviderPaymentIntentInput,
  ): Promise<ProviderPaymentIntent> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: input.currency,
        description: input.description,
        payment_method_types: ['card'],
        metadata: input.metadata,
        ...(input.receiptEmail ? { receipt_email: input.receiptEmail } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return mapPaymentIntent(pi);
  }

  async retrievePaymentIntent(
    id: string,
  ): Promise<ProviderPaymentIntent | null> {
    try {
      return mapPaymentIntent(await this.stripe.paymentIntents.retrieve(id));
    } catch (e) {
      if (e instanceof Stripe.errors.StripeInvalidRequestError) return null;
      throw e;
    }
  }

  async cancelPaymentIntent(id: string): Promise<ProviderPaymentIntent | null> {
    try {
      return mapPaymentIntent(await this.stripe.paymentIntents.cancel(id));
    } catch (e) {
      // Already paid / canceled: report its real state.
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
      return this.retrievePaymentIntent(id);
    }
  }

  async expireCheckoutSession(
    id: string,
  ): Promise<ProviderCheckoutSession | null> {
    try {
      return mapCheckout(await this.stripe.checkout.sessions.expire(id));
    } catch (e) {
      // Already complete / expired: report its real state.
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
      return this.retrieveCheckoutSession(id);
    }
  }

  async setSubscriptionPaymentMethod(
    subscriptionId: string,
    paymentMethodId: string,
  ): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      default_payment_method: paymentMethodId,
    });
  }

  async retrieveInvoice(id: string): Promise<ProviderInvoice | null> {
    try {
      const inv = await this.stripe.invoices.retrieve(id);
      return mapInvoice(inv);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async retrieveCharge(id: string): Promise<ProviderCharge | null> {
    try {
      const ch = await this.stripe.charges.retrieve(id);
      return {
        id: ch.id,
        paymentIntentId:
          typeof ch.payment_intent === 'string'
            ? ch.payment_intent
            : (ch.payment_intent?.id ?? null),
        refunded: ch.refunded,
        amountRefundedCents: ch.amount_refunded,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async createCoupon(input: ProviderCouponInput): Promise<ProviderCoupon> {
    // No idempotency key: a code whose limits changed gets a new coupon.
    const coupon = await this.stripe.coupons.create({
      name: input.code,
      duration: 'once',
      ...(input.percentOff
        ? { percent_off: input.percentOff }
        : {
            amount_off: input.amountOffCents ?? 0,
            currency: input.currency,
          }),
      ...(input.maxRedemptions
        ? { max_redemptions: input.maxRedemptions }
        : {}),
      ...(input.redeemBy ? { redeem_by: input.redeemBy } : {}),
      metadata: input.metadata,
    });
    let promotionCodeId: string | null = null;
    try {
      const pc = await this.stripe.promotionCodes.create({
        promotion: { type: 'coupon', coupon: coupon.id },
        code: input.code,
        ...(input.maxRedemptions
          ? { max_redemptions: input.maxRedemptions }
          : {}),
        ...(input.redeemBy ? { expires_at: input.redeemBy } : {}),
        metadata: input.metadata,
      });
      promotionCodeId = pc.id;
    } catch {
      // The code may already exist in Stripe (created by hand): the
      // coupon alone is enough for the API's checkout.
    }
    return { couponId: coupon.id, promotionCodeId };
  }

  async deleteCoupon(couponId: string): Promise<void> {
    try {
      await this.stripe.coupons.del(couponId);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  async refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<ProviderRefund> {
    const r = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return {
      id: r.id,
      status:
        r.status === 'succeeded'
          ? 'succeeded'
          : r.status === 'failed' || r.status === 'canceled'
            ? 'failed'
            : 'pending',
      failureReason: r.failure_reason ?? null,
    };
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
    options: { connect?: boolean } = {},
  ): ProviderEvent {
    const secret = options.connect
      ? (this.connectWebhookSecret ?? this.webhookSecret)
      : this.webhookSecret;
    if (!secret || !signature) {
      throw new WebhookSignatureError('Webhook secret or signature missing');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (e) {
      throw new WebhookSignatureError(
        e instanceof Error ? e.message : 'Invalid signature',
      );
    }
    const object = event.data.object as unknown as ProviderEvent['object'];
    // A Connect event names the connected account it happened on.
    const account = (event as { account?: string }).account;
    return {
      id: event.id,
      type: event.type,
      created: event.created,
      object: account ? { ...object, _account: account } : object,
    };
  }

  // ---- Stripe Connect (owner 2026-10-05) ----------------------------------

  async createConnectAccount(input: {
    userId: string;
    email: string | null;
    country: string;
  }): Promise<string> {
    const acc = await this.stripe.accounts.create(
      {
        type: 'express',
        country: input.country,
        ...(input.email ? { email: input.email } : {}),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          mcc: '8111', // legal services
          product_description: 'Legal services booked through LawBid',
        },
        metadata: { userId: input.userId },
      },
      { idempotencyKey: `connect-account:${input.userId}` },
    );
    return acc.id;
  }

  async createAccountOnboardingLink(input: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  async createAccountLoginLink(accountId: string): Promise<string> {
    const link = await this.stripe.accounts.createLoginLink(accountId);
    return link.url;
  }

  async retrieveConnectAccount(
    accountId: string,
  ): Promise<ProviderConnectAccount | null> {
    try {
      const account = await this.stripe.accounts.retrieve(accountId);
      const mapped = mapConnectAccount(account);
      // Company accounts: the representative and owners are Persons, not
      // fields of the account (the trust check compares them with the
      // attorney, never the company name).
      if (account.business_type && account.business_type !== 'individual') {
        const persons = await this.stripe.accounts.listPersons(accountId, {
          limit: 20,
        });
        mapped.people = persons.data.map(mapPerson);
      }
      return mapped;
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async updateConnectPayoutDelay(
    accountId: string,
    days: number | null,
  ): Promise<void> {
    await this.stripe.accounts.update(accountId, {
      settings: {
        payouts: {
          schedule:
            days === null
              ? { interval: 'daily', delay_days: 'minimum' }
              : { interval: 'daily', delay_days: days },
        },
      },
    });
  }

  async createConnectedCheckout(
    input: ProviderConnectedCheckoutInput,
  ): Promise<{ id: string; url: string }> {
    const s = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: input.amountCents,
              product_data: { name: input.description },
            },
          },
        ],
        ...(input.customerId
          ? {
              customer: input.customerId,
              ...(input.saveCard
                ? {
                    saved_payment_method_options: {
                      payment_method_save: 'enabled' as const,
                    },
                  }
                : {}),
            }
          : input.customerEmail
            ? { customer_email: input.customerEmail }
            : {}),
        metadata: input.metadata,
        payment_intent_data: {
          metadata: input.metadata,
          ...(input.applicationFeeCents > 0
            ? { application_fee_amount: input.applicationFeeCents }
            : {}),
        },
        client_reference_id: input.metadata.userId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      {
        stripeAccount: input.accountId,
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      },
    );
    return { id: s.id, url: s.url ?? '' };
  }

  async ensureConnectedCustomer(input: {
    accountId: string;
    email: string | null;
    name: string | null;
    metadata: Record<string, string>;
  }): Promise<string> {
    const c = await this.stripe.customers.create(
      {
        ...(input.email ? { email: input.email } : {}),
        ...(input.name ? { name: input.name } : {}),
        metadata: input.metadata,
      },
      { stripeAccount: input.accountId },
    );
    return c.id;
  }

  async retrieveConnectedCheckout(
    accountId: string,
    sessionId: string,
  ): Promise<ProviderConnectedCheckout | null> {
    try {
      const s = await this.stripe.checkout.sessions.retrieve(
        sessionId,
        { expand: ['payment_intent.latest_charge'] },
        { stripeAccount: accountId },
      );
      const pi = typeof s.payment_intent === 'string' ? null : s.payment_intent;
      const charge =
        pi && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null;
      return {
        id: s.id,
        accountId,
        url: s.url ?? null,
        status: (s.status ?? 'open') as ProviderConnectedCheckout['status'],
        paymentStatus: s.payment_status ?? null,
        paymentIntentId:
          typeof s.payment_intent === 'string'
            ? s.payment_intent
            : (pi?.id ?? null),
        chargeId:
          charge?.id ??
          (typeof pi?.latest_charge === 'string' ? pi.latest_charge : null),
        receiptUrl: charge?.receipt_url ?? null,
        amountTotalCents: s.amount_total ?? null,
        metadata: s.metadata ?? {},
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async refundConnected(input: {
    accountId: string;
    paymentIntentId: string;
    amountCents: number;
    refundApplicationFee: boolean;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<ProviderRefund> {
    const r = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        amount: input.amountCents,
        refund_application_fee: input.refundApplicationFee,
        metadata: input.metadata,
      },
      { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
    );
    return {
      id: r.id,
      status:
        r.status === 'succeeded'
          ? 'succeeded'
          : r.status === 'failed' || r.status === 'canceled'
            ? 'failed'
            : 'pending',
      failureReason: r.failure_reason ?? null,
    };
  }

  async retrieveConnectedCharge(
    accountId: string,
    chargeId: string,
  ): Promise<ProviderConnectedCharge | null> {
    try {
      // `dispute` is not on the Charge type of this SDK version; the
      // open dispute (if any) is listed by charge instead.
      const ch = await this.stripe.charges.retrieve(chargeId, undefined, {
        stripeAccount: accountId,
      });
      const dispute = ch.disputed
        ? ((
            await this.stripe.disputes.list(
              { charge: chargeId, limit: 1 },
              { stripeAccount: accountId },
            )
          ).data[0] ?? null)
        : null;
      return {
        id: ch.id,
        paymentIntentId:
          typeof ch.payment_intent === 'string'
            ? ch.payment_intent
            : (ch.payment_intent?.id ?? null),
        amountCents: ch.amount,
        amountRefundedCents: ch.amount_refunded,
        refunded: ch.refunded,
        receiptUrl: ch.receipt_url ?? null,
        disputed: ch.disputed,
        disputeStatus: dispute?.status ?? null,
      };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  dashboardUrl(subscriptionId: string): string {
    return `https://dashboard.stripe.com/${this.live ? '' : 'test/'}subscriptions/${subscriptionId}`;
  }
}

function mapConnectAccount(a: Stripe.Account): ProviderConnectAccount {
  const due = [
    ...(a.requirements?.currently_due ?? []),
    ...(a.requirements?.past_due ?? []),
  ];
  return {
    id: a.id,
    chargesEnabled: Boolean(a.charges_enabled),
    payoutsEnabled: Boolean(a.payouts_enabled),
    detailsSubmitted: Boolean(a.details_submitted),
    requirementsDue: [...new Set(due)],
    disabledReason: a.requirements?.disabled_reason ?? null,
    country: a.country ?? null,
    businessType: a.business_type ?? null,
    legalFirstName: a.individual?.first_name ?? null,
    legalLastName: a.individual?.last_name ?? null,
    companyName: a.company?.name ?? null,
    companyUrl: a.business_profile?.url ?? null,
  };
}

function mapPerson(p: Stripe.Person): ProviderConnectPerson {
  const r = p.relationship;
  const role = r?.representative
    ? 'representative'
    : r?.owner
      ? 'owner'
      : r?.executive
        ? 'executive'
        : r?.director
          ? 'director'
          : null;
  return {
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    role,
  };
}

function isNotFound(e: unknown): boolean {
  return (
    e instanceof Stripe.errors.StripeError && e.code === 'resource_missing'
  );
}

/** The subscription's assistant-seat item (current or an older seat price). */
function seatItemOf(
  sub: Stripe.Subscription,
  seatPriceId: string,
  known: string[] = [],
): Stripe.SubscriptionItem | undefined {
  const ids = new Set([seatPriceId, ...known]);
  return sub.items.data.find((i) => ids.has(i.price.id));
}

function isProrationLine(l: Stripe.InvoiceLineItem): boolean {
  const p = l.parent;
  return Boolean(
    p?.subscription_item_details?.proration ??
    p?.invoice_item_details?.proration ??
    (l as { proration?: boolean }).proration,
  );
}

/** The PaymentIntent paying an invoice (API ≥ basil: invoice.payments). */
function paymentIntentOf(invoice: Stripe.Invoice | null): string | null {
  if (!invoice) return null;
  for (const p of invoice.payments?.data ?? []) {
    const pi = p.payment?.payment_intent;
    if (pi) return typeof pi === 'string' ? pi : pi.id;
  }
  const legacy = (invoice as InvoiceLike).payment_intent;
  return legacy ? (typeof legacy === 'string' ? legacy : legacy.id) : null;
}

type SubLike = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};

function mapSubscription(sub: Stripe.Subscription): ProviderSubscription {
  const s = sub as SubLike;
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  return {
    id: sub.id,
    customerId:
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status as ProviderSubscription['status'],
    trialStart: sub.trial_start ?? null,
    trialEnd: sub.trial_end ?? null,
    currentPeriodStart:
      item?.current_period_start ?? s.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? s.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at ?? null,
    defaultPaymentMethodId:
      typeof sub.default_payment_method === 'string'
        ? sub.default_payment_method
        : (sub.default_payment_method?.id ?? null),
    metadata: sub.metadata ?? {},
    // Owner 2026-10-22: the sync reads the seat item's quantity from here.
    items: (sub.items?.data ?? []).map((i) => ({
      priceId: i.price.id,
      quantity: i.quantity ?? 0,
      unitAmountCents: i.price.unit_amount ?? null,
    })),
    pendingUpdateExpiresAt: sub.pending_update?.expires_at ?? null,
    latestInvoiceId:
      sub.latest_invoice == null
        ? null
        : typeof sub.latest_invoice === 'string'
          ? sub.latest_invoice
          : sub.latest_invoice.id,
  };
}

type InvoiceLike = Stripe.Invoice & {
  subscription?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
};

/** The tax on an invoice: the `total_taxes` lines of the current API,
 * or the older single `tax` field; null when the invoice has neither. */
function invoiceTaxCents(inv: Stripe.Invoice): number | null {
  const i = inv as unknown as {
    total_taxes?: { amount: number }[] | null;
    tax?: number | null;
  };
  if (Array.isArray(i.total_taxes)) {
    return i.total_taxes.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  }
  return typeof i.tax === 'number' ? i.tax : null;
}

/** Customer `address` / `tax.ip_address` params from what we know. */
function taxLocationParams(
  location: ProviderTaxLocation | null,
): Stripe.CustomerUpdateParams {
  if (!location) return {};
  const a = location.address;
  return {
    ...(a
      ? {
          address: {
            country: a.country,
            ...(a.postalCode ? { postal_code: a.postalCode } : {}),
            ...(a.state ? { state: a.state } : {}),
            ...(a.city ? { city: a.city } : {}),
            ...(a.line1 ? { line1: a.line1 } : {}),
          },
        }
      : {}),
    ...(location.ip ? { tax: { ip_address: location.ip } } : {}),
  };
}

function mapInvoice(inv: Stripe.Invoice): ProviderInvoice {
  const i = inv as InvoiceLike;
  const sub =
    i.subscription ?? i.parent?.subscription_details?.subscription ?? null;
  const pi = i.payment_intent ?? null;
  return {
    id: inv.id,
    customerId:
      typeof inv.customer === 'string'
        ? inv.customer
        : (inv.customer?.id ?? null),
    subscriptionId: typeof sub === 'string' ? sub : (sub?.id ?? null),
    amountCents: inv.amount_paid || inv.amount_due,
    taxCents: invoiceTaxCents(inv),
    subtotalCents: typeof inv.subtotal === 'number' ? inv.subtotal : null,
    currency: inv.currency,
    status: (inv.status ?? 'open') as ProviderInvoice['status'],
    paidAt: inv.status_transitions?.paid_at ?? null,
    paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? null),
    failureCode: null,
  };
}

function mapPaymentIntent(pi: Stripe.PaymentIntent): ProviderPaymentIntent {
  return {
    id: pi.id,
    status: pi.status,
    amountCents: pi.amount,
    currency: pi.currency,
    clientSecret: pi.client_secret ?? null,
    metadata: pi.metadata ?? {},
  };
}

function mapCheckout(s: Stripe.Checkout.Session): ProviderCheckoutSession {
  const ref = (v: string | { id: string } | null | undefined) =>
    v == null ? null : typeof v === 'string' ? v : v.id;
  return {
    id: s.id,
    url: s.url ?? null,
    status: (s.status ?? 'open') as ProviderCheckoutSession['status'],
    customerId: ref(s.customer),
    subscriptionId: ref(s.subscription),
    metadata: s.metadata ?? {},
    paymentIntentId: ref(s.payment_intent),
    amountTotalCents: s.amount_total ?? null,
    paymentStatus: s.payment_status ?? null,
  };
}

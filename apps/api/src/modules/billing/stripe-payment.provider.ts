import Stripe from 'stripe';
import {
  type PaymentProvider,
  type ProviderCharge,
  type ProviderCheckoutSession,
  type ProviderEvent,
  type ProviderInvoice,
  type ProviderSetupIntent,
  type ProviderSubscription,
  WebhookSignatureError,
} from './payment-provider';

/**
 * docs/06 §1.4–1.6 over the official SDK. Period boundaries are read from
 * the subscription item (where recent API versions keep them) with the
 * legacy top-level fields as a fallback.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  private readonly stripe: Stripe;
  private readonly live: boolean;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey, {
      typescript: true,
      maxNetworkRetries: 2,
    });
    this.live = /^(sk|rk)_live_/.test(secretKey);
  }

  async createCustomer(input: {
    userId: string;
    email: string | null;
  }): Promise<string> {
    const c = await this.stripe.customers.create(
      {
        ...(input.email ? { email: input.email } : {}),
        metadata: { userId: input.userId },
      },
      { idempotencyKey: `customer:${input.userId}` },
    );
    return c.id;
  }

  async createSetupIntent(
    customerId: string,
  ): Promise<{ id: string; clientSecret: string }> {
    const si = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
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
    paymentMethodId: string;
    trialDays: number | null;
    metadata: Record<string, string>;
  }): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.create(
      {
        customer: input.customerId,
        items: [{ price: input.priceId }],
        default_payment_method: input.paymentMethodId,
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        payment_settings: { save_default_payment_method: 'on_subscription' },
        // §1.3: a trial that can't be charged ends up `unpaid` → expired.
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata: input.metadata,
      },
      {
        // Retries within the hour dedupe; a later re-subscription with the
        // same card is a new request (Stripe replays a key for 24 h).
        idempotencyKey: `subscription:${input.metadata.userId}:${input.paymentMethodId}:${input.trialDays ?? 0}:${new Date().toISOString().slice(0, 13)}`,
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
  ): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const item = sub.items.data.find((i) => i.price.id === seatPriceId);
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
        proration_behavior: 'create_prorations',
      }),
    );
  }

  async switchToYearly(
    subscriptionId: string,
    yearlyPriceId: string,
  ): Promise<ProviderSubscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      ...sub.items.data.map((i) => ({ id: i.id, deleted: true })),
      { price: yearlyPriceId, quantity: 1 },
    ];
    return mapSubscription(
      await this.stripe.subscriptions.update(subscriptionId, {
        items,
        proration_behavior: 'always_invoice',
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
  }): Promise<ProviderCheckoutSession> {
    const s = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      line_items: input.lineItems.map((l) => ({
        price: l.priceId,
        quantity: l.quantity,
      })),
      payment_method_collection: 'always',
      subscription_data: {
        ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        metadata: input.metadata,
      },
      metadata: input.metadata,
      client_reference_id: input.metadata.userId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
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

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): ProviderEvent {
    if (!this.webhookSecret || !signature) {
      throw new WebhookSignatureError('Webhook secret or signature missing');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (e) {
      throw new WebhookSignatureError(
        e instanceof Error ? e.message : 'Invalid signature',
      );
    }
    const object = event.data.object as unknown as ProviderEvent['object'];
    return { id: event.id, type: event.type, created: event.created, object };
  }

  dashboardUrl(subscriptionId: string): string {
    return `https://dashboard.stripe.com/${this.live ? '' : 'test/'}subscriptions/${subscriptionId}`;
  }
}

function isNotFound(e: unknown): boolean {
  return (
    e instanceof Stripe.errors.StripeError && e.code === 'resource_missing'
  );
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
  };
}

type InvoiceLike = Stripe.Invoice & {
  subscription?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
};

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
    currency: inv.currency,
    status: (inv.status ?? 'open') as ProviderInvoice['status'],
    paidAt: inv.status_transitions?.paid_at ?? null,
    paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? null),
    failureCode: null,
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
  };
}

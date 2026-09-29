import { randomUUID } from 'node:crypto';
import {
  type PaymentProvider,
  type ProviderCharge,
  type ProviderEvent,
  type ProviderInvoice,
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
  readonly customers = new Map<string, { id: string; userId: string }>();
  readonly setupIntents = new Map<string, ProviderSetupIntent>();
  readonly cards = new Map<string, FakeCard>();
  readonly subscriptions = new Map<
    string,
    ProviderSubscription & { _version: number }
  >();
  readonly invoices = new Map<string, ProviderInvoice & { _version: number }>();
  readonly charges = new Map<string, ProviderCharge>();

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
    } else if (object.object === 'charge') {
      this.charges.set(id, {
        id,
        paymentIntentId: (object.payment_intent as string | null) ?? null,
        refunded: Boolean(object.refunded),
        amountRefundedCents: (object.amount_refunded as number) ?? 0,
      });
    }
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

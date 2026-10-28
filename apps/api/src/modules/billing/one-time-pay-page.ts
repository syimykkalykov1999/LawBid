import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  isPaymentIntentId,
  paymentIntentAsCheckout,
  type PaymentProvider,
  type ProviderCheckoutSession,
} from './payment-provider';

/** A one-time purchase row (stars top-up, offer pack). */
export interface OneTimeRow {
  id: string;
  user_id: string;
  status: string;
  price_cents: number;
  stripe_checkout_id: string | null;
}

export interface OneTimePaySession {
  paid: boolean;
  amountCents: number;
  clientSecret: string | null;
}

/**
 * Owner 2026-10-22: a one-time purchase on our card page — one
 * PaymentIntent per purchase row, made when the page opens and kept on the
 * row. A Stripe hosted session from before is closed first (paid → it is
 * applied). The caller's [apply] is its existing checkout applier.
 */
export async function oneTimePayPageSession(opts: {
  provider?: PaymentProvider;
  row: OneTimeRow | null;
  userId: string;
  kind: string;
  description: string;
  receiptEmail?: string | null;
  save: (paymentIntentId: string) => Promise<void>;
  apply: (session: ProviderCheckoutSession) => Promise<boolean>;
}): Promise<OneTimePaySession> {
  const { provider, row, userId } = opts;
  if (!row || row.user_id !== userId) {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'No such purchase.',
    });
  }
  const paid = { paid: true, amountCents: row.price_cents, clientSecret: null };
  if (row.status === 'paid') return paid;
  if (row.status !== 'pending_payment') {
    throw new ConflictException({
      code: ErrorCode.CONTENT_INVALID_STATE,
      message: 'This purchase was cancelled. Start it again from the app.',
    });
  }
  if (!provider?.createPaymentIntent) {
    throw new ServiceUnavailableException({
      code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
      message: 'Payments are not configured on this server.',
    });
  }
  const current = row.stripe_checkout_id;
  if (current && !isPaymentIntentId(current)) {
    const s = await provider.expireCheckoutSession?.(current);
    if (s?.status === 'complete') {
      await opts.apply(s);
      return paid;
    }
  } else if (current) {
    const pi = await provider.retrievePaymentIntent?.(current);
    if (pi?.status === 'succeeded') {
      await opts.apply(paymentIntentAsCheckout(pi));
      return paid;
    }
    if (pi && pi.status !== 'canceled') {
      return {
        paid: false,
        amountCents: row.price_cents,
        clientSecret: pi.clientSecret,
      };
    }
  }
  // Algo audit 2026-10-27 (MONEY M-6): after a canceled PaymentIntent the
  // same key would make Stripe replay that canceled intent for 24 h (the
  // buyer could not pay). The key then names the intent it replaces —
  // still one new intent per state, never two.
  const replaces = current && isPaymentIntentId(current) ? `:${current}` : '';
  const pi = await provider.createPaymentIntent({
    amountCents: row.price_cents,
    currency: 'usd',
    description: opts.description,
    metadata: { kind: opts.kind, purchaseId: row.id, userId },
    receiptEmail: opts.receiptEmail ?? null,
    idempotencyKey: `${opts.kind}-pi:${row.id}${replaces}`,
  });
  await opts.save(pi.id);
  return {
    paid: false,
    amountCents: row.price_cents,
    clientSecret: pi.clientSecret,
  };
}

/**
 * Owner 2026-10-22: the card the card page saved for a subscription — the
 * SetupIntent must be this customer's and succeeded. Returns its payment
 * method.
 */
export async function savedCardOf(
  provider: PaymentProvider,
  customerId: string,
  setupIntentId: string,
): Promise<string> {
  const si = await provider.retrieveSetupIntent(setupIntentId);
  if (
    !si ||
    si.status !== 'succeeded' ||
    !si.paymentMethodId ||
    si.customerId !== customerId
  ) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'The card was not saved. Try again.',
    });
  }
  return si.paymentMethodId;
}

/** The checkout object behind a stored id (a PaymentIntent of our card
 * page or a Stripe hosted session), for the existing appliers. */
export async function checkoutOf(
  provider: PaymentProvider | undefined,
  id: string,
): Promise<ProviderCheckoutSession | null> {
  if (!provider) return null;
  if (isPaymentIntentId(id)) {
    const pi = await provider.retrievePaymentIntent?.(id);
    return pi ? paymentIntentAsCheckout(pi) : null;
  }
  return provider.retrieveCheckoutSession(id);
}

import type { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { ProviderCheckoutSession } from '../billing/payment-provider';
import {
  BID_PACK_CHECKOUT_KIND,
  BidPacksService,
  parsePacks,
} from './bid-packs.service';

/**
 * Owner 2026-10-22 (audit #4 §10): offer packs — flag, verification,
 * the hosted checkout and the idempotent credit of a paid session.
 */
type Row = Record<string, unknown>;

function make(
  opts: {
    enabled?: boolean;
    verified?: boolean;
    requireVerified?: boolean;
    provider?: boolean;
    checkoutFails?: boolean;
    packs?: unknown;
  } = {},
) {
  const purchases = new Map<string, Row>();
  let credits = 0;
  const payments: Row[] = [];
  const tx = {
    bidPackPurchase: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(purchases.get(where.id) ?? null),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const next = { ...purchases.get(where.id), ...data };
          purchases.set(where.id, next);
          return Promise.resolve(next);
        },
      ),
    },
    payment: {
      create: jest.fn(({ data }: { data: Row }) => {
        const p = { id: `pay_${payments.length + 1}`, ...data };
        payments.push(p);
        return Promise.resolve(p);
      }),
    },
    bidCredit: {
      upsert: jest.fn(({ create }: { create: { balance: number } }) => {
        credits += create.balance;
        return Promise.resolve({ balance: credits });
      }),
    },
  };
  const prisma = {
    ...tx,
    featureFlag: {
      findUnique: jest.fn(() =>
        Promise.resolve({ enabled: opts.enabled ?? true }),
      ),
    },
    appConfig: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          opts.packs === undefined ? null : { value: opts.packs },
        ),
      ),
    },
    attorneyProfile: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          verification_status: opts.verified === false ? 'pending' : 'verified',
        }),
      ),
    },
    user: {
      findUnique: jest.fn(() => Promise.resolve({ email: 'a@b.test' })),
    },
    bidPackPurchase: {
      ...tx.bidPackPurchase,
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: 'pur_1', status: 'pending_payment', ...data };
        purchases.set('pur_1', row);
        return Promise.resolve(row);
      }),
    },
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const provider = {
    createOneTimeCheckout: jest.fn(() =>
      opts.checkoutFails
        ? Promise.reject(new Error('stripe down'))
        : Promise.resolve({ id: 'cs_1', url: 'https://pay.test/cs_1' }),
    ),
    retrieveCheckoutSession: jest.fn(),
  };
  const settings = {
    boolean: jest.fn(() => Promise.resolve(opts.requireVerified ?? true)),
  };
  const svc = new BidPacksService(
    prisma as never,
    { get: () => 'https://app.test' } as unknown as ConfigService,
    opts.provider === false ? undefined : (provider as never),
    settings as never,
  );
  return { svc, prisma, provider, purchases, payments, credits: () => credits };
}

const paidSession = (
  over: Record<string, unknown> = {},
): ProviderCheckoutSession => ({
  id: 'cs_1',
  url: null,
  status: 'complete' as const,
  paymentStatus: 'paid',
  customerId: null,
  subscriptionId: null,
  paymentIntentId: 'pi_1',
  amountTotalCents: 1500,
  metadata: { kind: BID_PACK_CHECKOUT_KIND, purchaseId: 'pur_1' },
  ...over,
});

describe('parsePacks', () => {
  it('keeps valid packs only; a broken row means the defaults', () => {
    expect(parsePacks(null).map((p) => p.id)).toEqual([
      'pack_10',
      'pack_30',
      'pack_100',
    ]);
    expect(
      parsePacks({
        packs: [
          { id: 'ok_pack', bids: 5, priceCents: 500 },
          { id: 'Bad Id', bids: 5, priceCents: 500 },
          { id: 'cheap', bids: 5, priceCents: 50 },
          { id: 'zero', bids: 0, priceCents: 500 },
        ],
      }),
    ).toEqual([{ id: 'ok_pack', bids: 5, priceCents: 500 }]);
  });
});

describe('BidPacksService.buy', () => {
  it('flag off → FEATURE_DISABLED', async () => {
    const { svc } = make({ enabled: false });
    await expect(svc.buy('u1', 'pack_10')).rejects.toMatchObject({
      response: { code: ErrorCode.FEATURE_DISABLED },
    });
  });

  it('an unverified attorney may not buy (while the rule is on)', async () => {
    await expect(
      make({ verified: false }).svc.buy('u1', 'pack_10'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.ATTORNEY_NOT_VERIFIED },
    });
    // Rule off: allowed.
    await expect(
      make({ verified: false, requireVerified: false }).svc.buy(
        'u1',
        'pack_10',
      ),
    ).resolves.toMatchObject({ purchaseId: 'pur_1' });
  });

  it('an unknown pack → NOT_FOUND; no payment provider → 503', async () => {
    await expect(make().svc.buy('u1', 'nope')).rejects.toMatchObject({
      response: { code: ErrorCode.NOT_FOUND },
    });
    await expect(
      make({ provider: false }).svc.buy('u1', 'pack_10'),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.PAYMENTS_NOT_CONFIGURED },
    });
  });

  it('opens the hosted checkout for the pack, idempotent per purchase', async () => {
    const h = make();
    expect(await h.svc.buy('u1', 'pack_30')).toEqual({
      purchaseId: 'pur_1',
      checkoutUrl: 'https://pay.test/cs_1',
    });
    expect(h.provider.createOneTimeCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 3900,
        idempotencyKey: 'bid-pack:pur_1',
        metadata: {
          kind: BID_PACK_CHECKOUT_KIND,
          purchaseId: 'pur_1',
          userId: 'u1',
        },
        successUrl: 'https://app.test/bid-packs/success?purchase_id=pur_1',
      }),
    );
    expect(h.purchases.get('pur_1')).toMatchObject({
      stripe_checkout_id: 'cs_1',
      bids: 30,
    });
  });

  it('a failed checkout leaves the purchase canceled', async () => {
    const h = make({ checkoutFails: true });
    await expect(h.svc.buy('u1', 'pack_10')).rejects.toThrow('stripe down');
    expect(h.purchases.get('pur_1')?.status).toBe('canceled');
  });
});

describe('BidPacksService.applyCheckout', () => {
  async function bought() {
    const h = make();
    await h.svc.buy('u1', 'pack_10');
    return h;
  }

  it('a paid session credits the offers once (webhook and app return race)', async () => {
    const h = await bought();
    expect(await h.svc.applyCheckout(paidSession())).toBe(true);
    expect(await h.svc.applyCheckout(paidSession())).toBe(false);
    expect(h.credits()).toBe(10);
    expect(h.payments).toHaveLength(1);
    expect(h.payments[0]).toMatchObject({
      amount_cents: 1500,
      stripe_payment_intent_id: 'pi_1',
      status: 'succeeded',
    });
    expect(h.purchases.get('pur_1')).toMatchObject({
      status: 'paid',
      payment_id: 'pay_1',
    });
  });

  it.each([
    ['another kind', { metadata: { kind: 'promotion', purchaseId: 'pur_1' } }],
    ['not complete', { status: 'open' }],
    ['unpaid', { paymentStatus: 'unpaid' }],
    ['another session', { id: 'cs_other' }],
  ])('ignores %s', async (_name, over) => {
    const h = await bought();
    expect(await h.svc.applyCheckout(paidSession(over))).toBe(false);
    expect(h.credits()).toBe(0);
  });
});

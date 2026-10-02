import type { PrismaService } from '../../prisma/prisma.service';
import {
  checkPromo,
  promoDiscountCents,
  promoRejectReason,
  type PromoRuleRow,
  recordPromoRedemption,
} from './promo-rules';

const DAY = 86_400_000;
const now = new Date('2026-10-02T12:00:00Z');

function promo(over: Partial<PromoRuleRow> = {}): PromoRuleRow {
  return {
    active: true,
    starts_at: null,
    expires_at: null,
    max_redemptions: null,
    redeemed_count: 0,
    audience: 'attorney',
    applies_to: 'any',
    ...over,
  };
}

const ctx = {
  role: 'attorney',
  purchase: 'monthly' as const,
  alreadyRedeemed: false,
  now,
};

describe('promoRejectReason (owner 2026-10-02)', () => {
  it('a live code for the right user and plan is valid', () => {
    expect(promoRejectReason(promo(), ctx)).toBeNull();
  });

  it('unknown code', () => {
    expect(promoRejectReason(null, ctx)).toBe('not_found');
  });

  it('switched off', () => {
    expect(promoRejectReason(promo({ active: false }), ctx)).toBe('inactive');
  });

  it('not started yet', () => {
    expect(
      promoRejectReason(
        promo({ starts_at: new Date(now.getTime() + DAY) }),
        ctx,
      ),
    ).toBe('not_started');
  });

  it('expired (expires_at is exclusive)', () => {
    expect(
      promoRejectReason(
        promo({ expires_at: new Date(now.getTime() - 1) }),
        ctx,
      ),
    ).toBe('expired');
    expect(promoRejectReason(promo({ expires_at: now }), ctx)).toBe('expired');
    expect(
      promoRejectReason(
        promo({ expires_at: new Date(now.getTime() + DAY) }),
        ctx,
      ),
    ).toBeNull();
  });

  it('exhausted at max_redemptions', () => {
    expect(
      promoRejectReason(promo({ max_redemptions: 5, redeemed_count: 5 }), ctx),
    ).toBe('exhausted');
    expect(
      promoRejectReason(promo({ max_redemptions: 5, redeemed_count: 4 }), ctx),
    ).toBeNull();
  });

  it('wrong audience', () => {
    expect(promoRejectReason(promo({ audience: 'client' }), ctx)).toBe(
      'wrong_audience',
    );
    expect(
      promoRejectReason(promo({ audience: 'attorney' }), {
        ...ctx,
        role: null,
      }),
    ).toBe('wrong_audience');
    expect(
      promoRejectReason(promo({ audience: 'all' }), { ...ctx, role: 'client' }),
    ).toBeNull();
  });

  it('wrong plan', () => {
    expect(promoRejectReason(promo({ applies_to: 'yearly' }), ctx)).toBe(
      'wrong_plan',
    );
    expect(promoRejectReason(promo({ applies_to: 'monthly' }), ctx)).toBeNull();
  });

  it('one per user', () => {
    expect(promoRejectReason(promo(), { ...ctx, alreadyRedeemed: true })).toBe(
      'already_used',
    );
  });
});

describe('promoDiscountCents', () => {
  const base = { percent_off: null, amount_off_cents: null };
  it('percent of the price, rounded', () => {
    expect(
      promoDiscountCents(
        { ...base, discount_type: 'percent', percent_off: 15 },
        59_900,
      ),
    ).toBe(8_985);
  });
  it('amount never above the price', () => {
    expect(
      promoDiscountCents(
        { ...base, discount_type: 'amount', amount_off_cents: 50_000 },
        39_900,
      ),
    ).toBe(39_900);
  });
  it('free days give no cents', () => {
    expect(
      promoDiscountCents({ ...base, discount_type: 'free_days' }, 39_900),
    ).toBeNull();
  });
});

describe('checkPromo', () => {
  const row = {
    id: 'p1',
    code: 'BLOGGER20',
    ...promo(),
  };

  it('normalizes the code and checks the per-user redemption', async () => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const redemption = jest.fn().mockResolvedValue({ id: 'r1' });
    const res = await checkPromo(
      {
        promoCode: { findUnique },
        promoRedemption: { findUnique: redemption },
      } as never,
      {
        code: ' blogger20 ',
        userId: 'u1',
        role: 'attorney',
        purchase: 'monthly',
      },
    );
    expect(findUnique).toHaveBeenCalledWith({ where: { code: 'BLOGGER20' } });
    expect(res).toMatchObject({ valid: false, reason: 'already_used' });
  });

  it('a malformed code is not looked up', async () => {
    const findUnique = jest.fn();
    const res = await checkPromo(
      { promoCode: { findUnique }, promoRedemption: {} } as never,
      {
        code: 'no spaces!',
        userId: 'u1',
        role: 'attorney',
        purchase: 'yearly',
      },
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(res).toEqual({ valid: false, reason: 'not_found', promo: null });
  });
});

describe('recordPromoRedemption', () => {
  function db(opts: {
    existing?: boolean;
    max?: number | null;
    count?: number;
  }) {
    const tx = {
      promoRedemption: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.existing ? { id: 'r0' } : null),
        create: jest.fn().mockResolvedValue({}),
      },
      promoCode: {
        findUnique: jest.fn().mockResolvedValue({
          max_redemptions: opts.max ?? null,
          redeemed_count: opts.count ?? 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    return { prisma, tx };
  }

  it('records once and bumps the counter in one transaction', async () => {
    const { prisma, tx } = db({});
    expect(
      await recordPromoRedemption(prisma, {
        promoId: 'p1',
        userId: 'u1',
        amountOffCents: 100,
      }),
    ).toBe(true);
    expect(tx.promoRedemption.create).toHaveBeenCalled();
    expect(tx.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { redeemed_count: { increment: 1 } },
    });
  });

  it('a second redemption by the same user is a no-op', async () => {
    const { prisma, tx } = db({ existing: true });
    expect(
      await recordPromoRedemption(prisma, {
        promoId: 'p1',
        userId: 'u1',
        amountOffCents: null,
      }),
    ).toBe(false);
    expect(tx.promoCode.update).not.toHaveBeenCalled();
  });

  it('an exhausted code records nothing', async () => {
    const { prisma, tx } = db({ max: 3, count: 3 });
    expect(
      await recordPromoRedemption(prisma, {
        promoId: 'p1',
        userId: 'u2',
        amountOffCents: null,
      }),
    ).toBe(false);
    expect(tx.promoRedemption.create).not.toHaveBeenCalled();
  });
});

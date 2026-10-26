import type { PrismaService } from '../../prisma/prisma.service';
import {
  BillingOverviewService,
  computeMrrCents,
  monthlyEquivalentCents,
} from './billing-overview.service';

describe('MRR (owner 2026-10-02)', () => {
  it('monthly = $399 + $100 per seat; yearly = $9,590 / 12', () => {
    expect(monthlyEquivalentCents('monthly', 0)).toBe(39_900);
    expect(monthlyEquivalentCents('monthly', 3)).toBe(69_900);
    expect(monthlyEquivalentCents('yearly', 6)).toBeCloseTo(79_916.67, 1);
  });

  it('counts active + past_due, trials at $0, rounds once', () => {
    expect(
      computeMrrCents([
        { status: 'active', plan: 'monthly', seats: 0, count: 2 },
        { status: 'active', plan: 'monthly', seats: 2, count: 1 },
        { status: 'past_due', plan: 'monthly', seats: 0, count: 1 },
        { status: 'active', plan: 'yearly', seats: 6, count: 3 },
        { status: 'trialing', plan: 'monthly', seats: 6, count: 10 },
        { status: 'canceled', plan: 'monthly', seats: 0, count: 4 },
      ]),
    ).toBe(2 * 39_900 + 59_900 + 39_900 + 959_000 / 4);
  });

  it('one yearly sub rounds 79,916.67 → 79,917', () => {
    expect(
      computeMrrCents([
        { status: 'active', plan: 'yearly', seats: 6, count: 1 },
      ]),
    ).toBe(79_917);
  });

  it('nothing billing → 0', () => {
    expect(computeMrrCents([])).toBe(0);
  });
});

describe('BillingOverviewService.overview', () => {
  it('assembles counts, grants, revenue minus refunds, redemptions', async () => {
    const prisma = {
      subscription: {
        groupBy: jest.fn().mockResolvedValue([
          {
            status: 'active',
            plan: 'monthly',
            assistant_seats: 1,
            _count: { _all: 2 },
          },
          {
            status: 'trialing',
            plan: 'monthly',
            assistant_seats: 0,
            _count: { _all: 3 },
          },
          {
            status: 'past_due',
            plan: 'yearly',
            assistant_seats: 6,
            _count: { _all: 1 },
          },
        ]),
      },
      contractGrant: { count: jest.fn().mockResolvedValue(4) },
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount_cents: 200_000 } }),
      },
      refund: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount_cents: 15_000 },
          _count: { _all: 2 },
        }),
      },
      promoRedemption: { count: jest.fn().mockResolvedValue(7) },
    };
    const o = await new BillingOverviewService(
      prisma as unknown as PrismaService,
    ).overview();
    expect(o).toMatchObject({
      mrrCents: Math.round(2 * 49_900 + 959_000 / 12),
      subscriptions: {
        active: 2,
        trialing: 3,
        pastDue: 1,
        monthly: 2,
        yearly: 1,
      },
      contractGrantsActive: 4,
      grossRevenue30dCents: 200_000,
      refunds30dCents: 15_000,
      refunds30dCount: 2,
      revenue30dCents: 185_000,
      promoRedemptions30d: 7,
    });
  });
});

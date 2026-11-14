import type { PrismaService } from '../../prisma/prisma.service';
import {
  BillingOverviewService,
  monthlyEquivalentCents,
} from './billing-overview.service';

describe('MRR (owner 2026-10-02)', () => {
  it('monthly = $399 + $100 per seat; yearly = $9,590 / 12', () => {
    expect(monthlyEquivalentCents('monthly', 0)).toBe(39_900);
    expect(monthlyEquivalentCents('monthly', 3)).toBe(69_900);
    expect(monthlyEquivalentCents('yearly', 6)).toBeCloseTo(79_916.67, 1);
  });
});

describe('BillingOverviewService.overview', () => {
  it('assembles counts, grants, revenue minus refunds, redemptions', async () => {
    const groups = [
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
    ];
    const prisma = {
      subscription: {
        // R3A-3 (14.11): the counts group by status; the MRR is the ONE
        // dashboard rule — paying rows (past_due only inside its grace),
        // stored price_cents (after promo codes) per plan.
        groupBy: jest.fn((args: { by: string[] }) =>
          Promise.resolve(
            args.by.includes('status')
              ? groups
              : [
                  { plan: 'monthly', _sum: { price_cents: 79_800 } },
                  { plan: 'yearly', _sum: { price_cents: 959_000 } },
                ],
          ),
        ),
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
      mrrCents: 79_800 + Math.round(959_000 / 12),
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
    const mrrCall = (
      prisma.subscription.groupBy.mock.calls as unknown as [
        { by: string[]; where: { OR: Record<string, unknown>[] } },
      ][]
    ).find(([a]) => !a.by.includes('status'));
    expect(mrrCall?.[0].where.OR).toEqual([
      { status: 'active' },
      { status: 'past_due', grace_ends_at: { gt: expect.any(Date) } },
    ]);
  });
});

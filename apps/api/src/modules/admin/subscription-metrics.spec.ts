import {
  liveSubscriptionWhere,
  monthlyRevenueCents,
  payingSubscriptionWhere,
} from './subscription-metrics';

describe('monthlyRevenueCents', () => {
  it('monthly price_cents as is (seats included), yearly / 12', () => {
    // 2 monthly: 39 900 + (39 900 + 2 × 10 000); 1 yearly: 959 000.
    expect(
      monthlyRevenueCents([
        { plan: 'monthly', priceCents: 39_900 + 59_900 },
        { plan: 'yearly', priceCents: 959_000 },
      ]),
    ).toBe(99_800 + Math.round(959_000 / 12));
  });

  it('is 0 without paying subscriptions', () => {
    expect(monthlyRevenueCents([])).toBe(0);
  });
});

describe('live / paying subscription rules', () => {
  const now = new Date('2026-10-02T00:00:00Z');

  it('live = trialing + active + past_due in grace (the gate rule)', () => {
    expect(liveSubscriptionWhere(now)).toEqual({
      OR: [
        { status: { in: ['trialing', 'active'] } },
        { status: 'past_due', grace_ends_at: { gt: now } },
      ],
    });
  });

  it('paying = active + past_due in grace (no trials)', () => {
    expect(payingSubscriptionWhere(now)).toEqual({
      OR: [
        { status: 'active' },
        { status: 'past_due', grace_ends_at: { gt: now } },
      ],
    });
  });
});

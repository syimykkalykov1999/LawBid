import {
  buildPnl,
  marginPercent,
  weekStart,
  type PaymentDayRow,
} from './pnl.rules';

const row = (p: Partial<PaymentDayRow>): PaymentDayRow => ({
  day: '2026-10-21',
  kind: 'subscriptions',
  subtotalCents: 10_000,
  grossCents: 10_000,
  refundedCents: 0,
  payments: 1,
  ...p,
});

// NOW: Sunday 2026-10-25 12:00 UTC. Week = Mon 19 .. Sun 25 Oct.
const NOW = new Date('2026-10-25T12:00:00Z');

describe('pnl rules', () => {
  it('weekStart is the Monday (UTC)', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });

  it('margin is profit / revenue, null with no revenue', () => {
    expect(marginPercent(25, 100)).toBe(25);
    expect(marginPercent(-10, 100)).toBe(-10);
    expect(marginPercent(5, 0)).toBeNull();
  });

  it('golden: one $100 payment, no refund -> $96.80 net (2.9 % + 30 c fee)', () => {
    const s = buildPnl({
      rows: [row({})],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    expect(s.month.revenueUsd).toBe(96.8);
    expect(s.month.profitUsd).toBe(96.8);
    expect(s.month.marginPercent).toBe(100);
  });

  it('golden: a $20 refund comes off, the fee stays -> $76.80', () => {
    const s = buildPnl({
      rows: [row({ refundedCents: 2_000 })],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    expect(s.month.revenueUsd).toBe(76.8);
  });

  it('tax is not revenue: price before tax, fee on the charged amount', () => {
    const s = buildPnl({
      rows: [row({ subtotalCents: 10_000, grossCents: 10_800 })],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    // 10000 - (10800 * 2.9 % + 30) = 9656.8 c
    expect(s.month.revenueUsd).toBe(96.57);
  });

  it('vendor costs and fixed costs come off; margin follows', () => {
    const s = buildPnl({
      rows: [row({ day: '2026-10-21' })],
      vendorDaily: [
        { date: '2026-10-21', usd: 10 },
        { date: '2026-10-22', usd: 6.8 },
      ],
      // 31 days in October: $31/month = $1 a day, 25 days elapsed
      fixed: [{ id: 'f', label: 'x', usd: 31, period: 'month' }],
      now: NOW,
    });
    expect(s.month.vendorCostUsd).toBe(16.8);
    expect(s.month.fixedCostUsd).toBe(25);
    expect(s.month.costUsd).toBe(41.8);
    expect(s.month.profitUsd).toBe(55);
    expect(s.month.marginPercent).toBe(56.82);
  });

  it('day / week / month windows are cut right', () => {
    const s = buildPnl({
      rows: [
        row({ day: '2026-10-25' }), // today
        row({ day: '2026-10-19' }), // Monday: this week
        row({ day: '2026-10-18' }), // last week, this month
        row({ day: '2026-09-30' }), // last month
      ],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    expect(s.today.revenueUsd).toBe(96.8);
    expect(s.week.revenueUsd).toBe(193.6);
    expect(s.month.revenueUsd).toBe(290.4);
  });

  it('12 weeks trend ends with the current week, oldest first, gaps are zero', () => {
    const s = buildPnl({
      rows: [row({ day: '2026-10-21' }), row({ day: '2026-08-12' })],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks[11].weekStart).toBe('2026-10-19');
    expect(s.weeks[11].revenueUsd).toBe(96.8);
    expect(s.weeks[0].weekStart).toBe('2026-08-03');
    expect(s.weeks[10].revenueUsd).toBe(0);
    // 12 Aug is in the week of 10 Aug
    expect(s.weeks.find((w) => w.weekStart === '2026-08-10')?.revenueUsd).toBe(
      96.8,
    );
  });

  it('month revenue is split by kind, biggest first', () => {
    const s = buildPnl({
      rows: [
        row({ kind: 'stars', subtotalCents: 1_000, grossCents: 1_000 }),
        row({ kind: 'subscriptions' }),
        row({ kind: 'seats', subtotalCents: 0, grossCents: 0, payments: 0 }),
      ],
      vendorDaily: [],
      fixed: [],
      now: NOW,
    });
    expect(s.byKind.map((k) => k.kind)).toEqual(['subscriptions', 'stars']);
  });

  it('a once/year fixed cost is spread right and nothing is NaN with no data', () => {
    const s = buildPnl({
      rows: [],
      vendorDaily: [],
      fixed: [
        { id: 'y', label: 'y', usd: 372, period: 'year' }, // 31 / month
        { id: 'o', label: 'o', usd: 100, period: 'once', paidMonth: '2026-09' },
      ],
      now: NOW,
    });
    expect(s.month.fixedCostUsd).toBe(25);
    expect(s.month.revenueUsd).toBe(0);
    expect(s.month.marginPercent).toBeNull();
    expect(s.month.profitUsd).toBe(-25);
  });
});

import {
  contractCutoff,
  contractEnded,
  finishedPeriods,
  goalState,
  percentToBps,
  periodBounds,
  readCountryPartnerSettings,
  readGoals,
  settle,
  settleUntil,
} from './country-partners.rules';

describe('country partner rules', () => {
  const fees = { feePercent: 2.9, feeFixedCents: 30 };

  it('share = (paid − refunds − card fees) × percent, rounded down', () => {
    // 2 × $99: fees 2×(287+30)=634; net 19800−634−0 = 19166; 20 % = 3833.
    expect(
      settle({ payments: [9900, 9900], refundsCents: 0 }, 2000, fees),
    ).toEqual({
      grossCents: 19800,
      refundsCents: 0,
      feesCents: 634,
      netCents: 19166,
      amountCents: 3833,
    });
  });

  it('a month with more refunds than sales pays nothing (never negative)', () => {
    const s = settle({ payments: [9900], refundsCents: 20000 }, 2000, fees);
    expect(s.netCents).toBeLessThan(0);
    expect(s.amountCents).toBe(0);
  });

  it('only finished months, from the start month, capped by the end date', () => {
    const now = new Date('2026-12-15T00:00:00Z');
    expect(finishedPeriods(new Date('2026-09-20T00:00:00Z'), now)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(
      finishedPeriods(
        new Date('2026-09-20T00:00:00Z'),
        now,
        new Date('2026-10-03T00:00:00Z'),
      ),
    ).toEqual(['2026-09', '2026-10']);
    expect(finishedPeriods(new Date('2026-12-01T00:00:00Z'), now)).toEqual([]);
    expect(
      finishedPeriods(
        new Date('2025-11-01T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      ),
    ).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('period bounds are whole UTC months', () => {
    const b = periodBounds('2026-12');
    expect(b.from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(b.to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('goals: bad entries dropped; met, on track, missed', () => {
    const goals = readGoals([
      { metric: 'attorneys', target: 50, deadline: '2026-12-31' },
      { metric: 'bogus', target: 1, deadline: '2026-12-31' },
      { metric: 'clients', target: 0, deadline: '2026-12-31' },
      { metric: 'revenue_cents', target: 100000, deadline: 'soon' },
    ]);
    expect(goals).toEqual([
      { metric: 'attorneys', target: 50, deadline: '2026-12-31' },
    ]);
    const g = goals[0];
    expect(goalState(g, 50, new Date('2027-02-01T00:00:00Z'))).toBe('met');
    expect(goalState(g, 10, new Date('2026-12-31T20:00:00Z'))).toBe('on_track');
    expect(goalState(g, 10, new Date('2027-01-01T00:00:01Z'))).toBe('missed');
  });

  it('settings fall back to defaults; percent ↔ basis points', () => {
    const s = readCountryPartnerSettings({
      feePercent: 'x',
      defaultMaxAdmins: 5,
    });
    expect(s.feePercent).toBe(2.9);
    expect(s.defaultMaxAdmins).toBe(5);
    expect(s.contract.version).toBe(1);
    expect(s.contract.text).toContain('COUNTRY PARTNER AGREEMENT');
    expect(percentToBps(20)).toBe(2000);
    expect(percentToBps(12.5)).toBe(1250);
  });

  it('the contract runs through its last day («Договор до»)', () => {
    const end = new Date('2026-12-31T00:00:00Z');
    expect(contractCutoff(end)).toEqual(new Date('2027-01-01T00:00:00Z'));
    expect(contractCutoff(null)).toBeNull();
    expect(contractEnded(end, new Date('2026-12-31T23:59:59Z'))).toBe(false);
    expect(contractEnded(end, new Date('2027-01-01T00:00:00Z'))).toBe(true);
    expect(contractEnded(null, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });

  it('settles up to the earlier of switch-off and the last day', () => {
    const end = new Date('2026-12-31T00:00:00Z');
    const lastMoment = new Date('2026-12-31T23:59:59.999Z');
    expect(settleUntil(null, end)).toEqual(lastMoment);
    expect(settleUntil(null, null)).toBeNull();
    const off = new Date('2026-11-10T00:00:00Z');
    expect(settleUntil(off, end)).toEqual(off);
    expect(settleUntil(new Date('2027-02-01T00:00:00Z'), end)).toEqual(
      lastMoment,
    );
    // A contract ending on the last day of a month stops at that month.
    expect(
      finishedPeriods(
        new Date('2026-10-01T00:00:00Z'),
        new Date('2027-03-05T00:00:00Z'),
        settleUntil(null, end),
      ),
    ).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

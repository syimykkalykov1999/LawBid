import {
  accrualRef,
  dayBounds,
  dayDate,
  dayStatus,
  effectiveRateCents,
  isDay,
  lineAmountCents,
  nextAccrualRef,
  pickRate,
  qualityFor,
  rateKindOf,
  yesterdayOf,
  type RateRow,
} from './piecework.calc';

const LA = 'America/Los_Angeles';
const PCT = { p90: 110, p75: 100, p60: 90, low: 75 };
const snap = (rating: number | null, status = 'ok') => ({ rating, status });

describe('qualityFor (owner bands 1.10 / 1.00 / 0.90 / 0.75)', () => {
  it.each([
    [100, 110, '90'],
    [90, 110, '90'],
    [89, 100, '75'],
    [75, 100, '75'],
    [74, 90, '60'],
    [60, 90, '60'],
    [59, 75, 'low'],
    [0, 75, 'low'],
  ])('rating %i -> %i %%', (rating, pct, band) => {
    const q = qualityFor(snap(rating), PCT);
    expect(q).toEqual({ pct, band, noRating: false });
  });

  it('low_data (rating null) is ×1.00 and is not «без рейтинга»', () => {
    expect(qualityFor(snap(null, 'low_data'), PCT)).toEqual({
      pct: 100,
      band: 'low_data',
      noRating: false,
    });
    // even a stored number does not count while the status says low_data
    expect(qualityFor(snap(95, 'low_data'), PCT).pct).toBe(100);
  });

  it('no snapshot at all is ×1.00 and marked «без рейтинга»', () => {
    expect(qualityFor(null, PCT)).toEqual({
      pct: 100,
      band: 'none',
      noRating: true,
    });
  });

  it('uses the owner numbers, not constants', () => {
    expect(qualityFor(snap(95), { ...PCT, p90: 120 }).pct).toBe(120);
  });
});

describe('lineAmountCents', () => {
  it('(units - overturned) x rate x coefficient', () => {
    expect(lineAmountCents(10, 0, 200, 100)).toBe(2000);
    expect(lineAmountCents(10, 2, 200, 100)).toBe(1600);
    expect(lineAmountCents(10, 0, 200, 110)).toBe(2200);
    expect(lineAmountCents(10, 0, 200, 90)).toBe(1800);
    expect(lineAmountCents(10, 0, 200, 75)).toBe(1500);
  });

  it('overturned decisions are not paid: more overturned than done is a reversal', () => {
    expect(lineAmountCents(1, 3, 200, 100)).toBe(-400);
  });

  it('rounds to whole cents', () => {
    expect(lineAmountCents(1, 0, 33, 110)).toBe(36);
  });
});

describe('rates', () => {
  const at = new Date('2026-10-26T23:59:59Z');
  const rate = (over: Partial<RateRow>): RateRow => ({
    kind: 'ticket',
    workspace: 'mass',
    amount_cents: 100,
    currency: 'usd',
    valid_from: new Date('2026-10-01T00:00:00Z'),
    valid_to: null,
    boost_mult: null,
    ...over,
  });

  it('picks the latest start that is in force', () => {
    const old = rate({
      amount_cents: 100,
      valid_to: new Date('2026-10-15T00:00:00Z'),
    });
    const cur = rate({
      amount_cents: 150,
      valid_from: new Date('2026-10-15T00:00:00Z'),
    });
    const later = rate({
      amount_cents: 999,
      valid_from: new Date('2026-11-01T00:00:00Z'),
    });
    expect(
      pickRate([old, cur, later], 'ticket', 'mass', at)?.amount_cents,
    ).toBe(150);
  });

  it('other kind or workspace, or an ended rate, gives none', () => {
    const r = rate({ valid_to: new Date('2026-10-20T00:00:00Z') });
    expect(pickRate([r], 'ticket', 'mass', at)).toBeNull();
    expect(pickRate([rate({})], 'report', 'mass', at)).toBeNull();
    expect(pickRate([rate({})], 'ticket', 'finance', at)).toBeNull();
  });

  it('quest multiplier is capped by the owner ceiling and never below 1', () => {
    expect(
      effectiveRateCents({ amount_cents: 100, boost_mult: null }, 120),
    ).toBe(100);
    expect(
      effectiveRateCents({ amount_cents: 100, boost_mult: 1.5 }, 120),
    ).toBe(120);
    expect(
      effectiveRateCents({ amount_cents: 100, boost_mult: 1.1 }, 120),
    ).toBe(110);
    expect(
      effectiveRateCents({ amount_cents: 100, boost_mult: 0.5 }, 120),
    ).toBe(100);
  });
});

describe('days and references', () => {
  it('maps work kinds to rate kinds; unpaid kinds map to null', () => {
    expect(rateKindOf('support_ticket')).toBe('ticket');
    expect(rateKindOf('mod_appeal')).toBe('appeal');
    expect(rateKindOf('review_appeal')).toBe('appeal');
    // Verify batch 11 (D1): both appeal queues record the decision (and so
    // the review sample) as `appeal`; an overturned one must come off pay.
    expect(rateKindOf('appeal')).toBe('appeal');
    expect(rateKindOf('verification')).toBe('verification');
    expect(rateKindOf('refund')).toBeNull();
    expect(rateKindOf('review_sample')).toBeNull();
  });

  it('validates days and bounds them in the report time zone (row 180)', () => {
    expect(isDay('2026-10-26')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('26-10-2026')).toBe(false);
    expect(dayDate('2026-10-26').toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
    const b = dayBounds('2026-11-14', LA);
    expect(b.start.toISOString()).toBe('2026-11-14T08:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-11-15T08:00:00.000Z');
    // A decision closed at 18:00 PST belongs to that Nevada day.
    const at = new Date('2026-11-15T02:00:00Z');
    expect(at >= b.start && at < b.end).toBe(true);
    // DST end (1 Nov 2026): the local day is 25 hours long.
    const dst = dayBounds('2026-11-01', LA);
    expect(dst.end.getTime() - dst.start.getTime()).toBe(25 * 3_600_000);
    expect(dayBounds('2026-11-14', 'UTC').start.toISOString()).toBe(
      '2026-11-14T00:00:00.000Z',
    );
  });

  it('yesterday is the last complete day of the report time zone', () => {
    // 18:00 PST on 14 Nov: the 14th is not over yet in Nevada.
    expect(yesterdayOf(new Date('2026-11-15T02:00:00Z'), LA)).toBe(
      '2026-11-13',
    );
    // The cron (10:15 UTC = 02:15 PST): the 14th has just closed.
    expect(yesterdayOf(new Date('2026-11-15T10:15:00Z'), LA)).toBe(
      '2026-11-14',
    );
  });

  it('accrual reference: one per person per day, revisions count up', () => {
    const ref = accrualRef('a1', '2026-10-26');
    expect(ref).toBe('staff_piecework:a1:2026-10-26');
    expect(nextAccrualRef(ref)).toBe(`${ref}:r2`);
    expect(nextAccrualRef(`${ref}:r2`)).toBe(`${ref}:r3`);
  });

  it('day status priority: not on payroll > reversal > no rating', () => {
    expect(dayStatus({ totalCents: 5, noRating: true, onPayroll: false })).toBe(
      'no_payroll',
    );
    expect(dayStatus({ totalCents: -5, noRating: true, onPayroll: true })).toBe(
      'reversed',
    );
    expect(dayStatus({ totalCents: 5, noRating: true, onPayroll: true })).toBe(
      'no_rating',
    );
    expect(dayStatus({ totalCents: 5, noRating: false, onPayroll: true })).toBe(
      'accrued',
    );
  });
});

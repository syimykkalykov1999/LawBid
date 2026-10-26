import {
  elapsedMinutes,
  entryCents,
  invoiceNumber,
  totalsOf,
} from './billing.math';

describe('billing math', () => {
  it('prices minutes at an hourly rate, to the cent', () => {
    expect(entryCents(60, 25000)).toBe(25000);
    expect(entryCents(90, 25000)).toBe(37500);
    expect(entryCents(7, 20000)).toBe(2333);
    expect(entryCents(0, 20000)).toBe(0);
  });

  it('counts a timer in whole minutes: at least one, at most a day', () => {
    const t0 = new Date('2026-10-20T10:00:00Z');
    expect(elapsedMinutes(t0, new Date('2026-10-20T10:00:05Z'))).toBe(1);
    expect(elapsedMinutes(t0, new Date('2026-10-20T10:25:29Z'))).toBe(25);
    expect(elapsedMinutes(t0, new Date('2026-10-20T10:25:31Z'))).toBe(26);
    expect(elapsedMinutes(t0, new Date('2026-10-25T10:00:00Z'))).toBe(1440);
    // a clock that went back is one minute, never negative
    expect(elapsedMinutes(t0, new Date('2026-10-20T09:00:00Z'))).toBe(1);
  });

  it('numbers an invoice from the case and its sequence', () => {
    expect(invoiceNumber('3f9a12cd-aaaa-bbbb-cccc-111122223333', 4)).toBe(
      'LB-3F9A12CD-004',
    );
  });

  it('sums time (each entry at its own rate) and expenses', () => {
    const t = totalsOf(
      [
        { minutes: 60, rateCents: 20000 },
        { minutes: 30, rateCents: 30000 },
      ],
      [1500, 2599],
    );
    expect(t).toEqual({
      minutes: 90,
      timeCents: 35000,
      expensesCents: 4099,
      totalCents: 39099,
    });
    expect(totalsOf([], [])).toEqual({
      minutes: 0,
      timeCents: 0,
      expensesCents: 0,
      totalCents: 0,
    });
  });
});

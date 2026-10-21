import { federalHolidays } from './federal-holidays';

describe('federalHolidays', () => {
  it('matches the published 2026 dates', () => {
    const dates = federalHolidays(2026).map((h) => h.date);
    expect(dates).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03',
      '2026-09-07',
      '2026-10-12',
      '2026-11-11',
      '2026-11-26',
      '2026-12-25',
    ]);
  });

  it('observes a Saturday holiday on Friday and a Sunday one on Monday', () => {
    const d27 = federalHolidays(2027).map((h) => h.date);
    expect(d27).toContain('2027-07-05'); // 4 July is a Sunday
    expect(d27).toContain('2027-06-18'); // 19 June is a Saturday
    expect(d27).toContain('2027-12-24'); // 25 December is a Saturday
    // 1 January 2028 is a Saturday: observed on 31 December 2027.
    expect(federalHolidays(2028).map((h) => h.date)).toContain('2027-12-31');
  });
});

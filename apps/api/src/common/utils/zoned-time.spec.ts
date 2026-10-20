import {
  addDaysIso,
  isoWeekday,
  isValidTimeZone,
  parseIsoDate,
  zonedParts,
  zonedWallToUtc,
} from './zoned-time';

describe('zoned time', () => {
  it('knows valid and invalid zone names', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('turns a wall-clock time into the right instant (winter and summer)', () => {
    // EST = UTC-5, EDT = UTC-4.
    expect(
      zonedWallToUtc(2026, 1, 15, 9 * 60, 'America/New_York')?.toISOString(),
    ).toBe('2026-01-15T14:00:00.000Z');
    expect(
      zonedWallToUtc(2026, 7, 15, 9 * 60, 'America/New_York')?.toISOString(),
    ).toBe('2026-07-15T13:00:00.000Z');
    expect(
      zonedWallToUtc(2026, 7, 15, 9 * 60, 'Asia/Kolkata')?.toISOString(),
    ).toBe('2026-07-15T03:30:00.000Z');
  });

  it('skips the hour that does not exist when clocks go forward', () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(zonedWallToUtc(2026, 3, 8, 150, 'America/New_York')).toBeNull();
    expect(
      zonedWallToUtc(2026, 3, 8, 3 * 60, 'America/New_York')?.toISOString(),
    ).toBe('2026-03-08T07:00:00.000Z');
  });

  it('takes the first of a repeated hour when clocks go back', () => {
    // 2026-11-01 01:30 happens twice; the first is EDT (UTC-4).
    expect(
      zonedWallToUtc(2026, 11, 1, 90, 'America/New_York')?.toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('reads the wall clock back from an instant', () => {
    const p = zonedParts(new Date('2026-07-04T02:15:00Z'), 'America/Los_Angeles');
    expect(p).toMatchObject({ year: 2026, month: 7, day: 3, hour: 19, minute: 15 });
    expect(p.weekday).toBe(5); // a Friday
  });

  it('computes ISO weekdays and date arithmetic', () => {
    expect(isoWeekday(2026, 10, 19)).toBe(1); // Monday
    expect(isoWeekday(2026, 10, 25)).toBe(7); // Sunday
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-2-3')).toBeNull();
  });
});

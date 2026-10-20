import {
  isValidTimeZone,
  localIsoDate,
  localSlotOnOrAfter,
  nextOccurrenceZoned,
  zonedParts,
  zonedToUtc,
} from './zoned-time';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

describe('zoned-time', () => {
  it('knows real zones and refuses made-up ones', () => {
    expect(isValidTimeZone(NY)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('reads the local clock and calendar of an instant', () => {
    const p = zonedParts(new Date('2026-07-01T03:30:00Z'), NY);
    expect(p).toMatchObject({ month: 6, day: 30, hour: 23, minute: 30 });
    expect(p.weekday).toBe(2); // Tuesday
  });

  it('converts a local time to an instant, summer and winter', () => {
    expect(
      zonedToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, NY).toISOString(),
    ).toBe('2026-07-01T13:00:00.000Z');
    expect(
      zonedToUtc({ year: 2026, month: 12, day: 1, hour: 9 }, NY).toISOString(),
    ).toBe('2026-12-01T14:00:00.000Z');
  });

  it('a time skipped by spring-forward lands just after the gap', () => {
    // 2026-03-08 02:30 does not exist in New York.
    const at = zonedToUtc(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      NY,
    );
    expect(at.toISOString()).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
  });

  it('a time that happens twice on fall-back is the first one', () => {
    // 2026-11-01 01:30 is EDT (05:30Z) and again EST (06:30Z).
    const at = zonedToUtc(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
      NY,
    );
    expect(at.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  describe('nextOccurrenceZoned', () => {
    it('daily keeps the local hour across the clock change', () => {
      // Saturday 09:00 EST → Sunday 09:00 EDT (the day clocks go forward).
      const sat = zonedToUtc({ year: 2026, month: 3, day: 7, hour: 9 }, NY);
      expect(sat.toISOString()).toBe('2026-03-07T14:00:00.000Z');
      const sun = nextOccurrenceZoned(sat, 'daily', NY);
      expect(sun.toISOString()).toBe('2026-03-08T13:00:00.000Z');
      expect(zonedParts(sun, NY).hour).toBe(9);
      // …and back in autumn.
      const sat2 = zonedToUtc({ year: 2026, month: 10, day: 31, hour: 9 }, NY);
      const sun2 = nextOccurrenceZoned(sat2, 'daily', NY);
      expect(sun2.toISOString()).toBe('2026-11-01T14:00:00.000Z');
      expect(zonedParts(sun2, NY).hour).toBe(9);
    });

    it('weekly keeps the local hour across the clock change', () => {
      const a = zonedToUtc({ year: 2026, month: 3, day: 5, hour: 18 }, NY);
      const b = nextOccurrenceZoned(a, 'weekly', NY);
      expect(zonedParts(b, NY)).toMatchObject({ day: 12, hour: 18 });
    });

    it('weekdays follow the local week, not the UTC one', () => {
      // Friday 23:30 in Los Angeles is already Saturday in UTC: the next
      // weekday is Monday, 23:30 local — a UTC reading would say Tuesday.
      const fri = zonedToUtc(
        { year: 2026, month: 10, day: 9, hour: 23, minute: 30 },
        LA,
      );
      expect(fri.toISOString()).toBe('2026-10-10T06:30:00.000Z');
      const next = nextOccurrenceZoned(fri, 'weekdays', LA);
      expect(zonedParts(next, LA)).toMatchObject({
        month: 10,
        day: 12,
        hour: 23,
        minute: 30,
        weekday: 1,
      });
      // Thursday → Friday, no skip.
      const thu = zonedToUtc({ year: 2026, month: 10, day: 8, hour: 9 }, LA);
      expect(zonedParts(nextOccurrenceZoned(thu, 'weekdays', LA), LA).day).toBe(
        9,
      );
    });

    it('weekdays in a zone ahead of UTC follow the local week', () => {
      // Auckland is UTC+13 in October: Friday 09:00 local is Thursday in UTC.
      const fri = zonedToUtc(
        { year: 2026, month: 10, day: 9, hour: 9 },
        'Pacific/Auckland',
      );
      const next = nextOccurrenceZoned(fri, 'weekdays', 'Pacific/Auckland');
      expect(zonedParts(next, 'Pacific/Auckland')).toMatchObject({
        day: 12,
        weekday: 1,
        hour: 9,
      });
    });

    it('monthly on the 31st lands on the last day of a short month', () => {
      const jan = zonedToUtc({ year: 2026, month: 1, day: 31, hour: 10 }, NY);
      expect(
        zonedParts(nextOccurrenceZoned(jan, 'monthly', NY), NY),
      ).toMatchObject({ month: 2, day: 28, hour: 10 });
      const dec = zonedToUtc({ year: 2026, month: 12, day: 15, hour: 10 }, NY);
      expect(
        zonedParts(nextOccurrenceZoned(dec, 'monthly', NY), NY),
      ).toMatchObject({ year: 2027, month: 1, day: 15 });
    });

    it('yearly on Feb 29 lands on Feb 28 in a common year', () => {
      const leap = zonedToUtc({ year: 2028, month: 2, day: 29, hour: 8 }, NY);
      expect(
        zonedParts(nextOccurrenceZoned(leap, 'yearly', NY), NY),
      ).toMatchObject({ year: 2029, month: 2, day: 28, hour: 8 });
    });

    it('UTC keeps the old behaviour', () => {
      expect(
        nextOccurrenceZoned(
          new Date('2026-01-31T15:00:00Z'),
          'monthly',
          'UTC',
        ).toISOString(),
      ).toBe('2026-02-28T15:00:00.000Z');
      expect(
        nextOccurrenceZoned(
          new Date('2026-10-09T15:00:00Z'),
          'weekdays',
          'UTC',
        ).toISOString(),
      ).toBe('2026-10-12T15:00:00.000Z');
    });
  });

  it('localSlotOnOrAfter picks today when the slot is still ahead', () => {
    const early = new Date('2026-10-20T10:00:00Z'); // 06:00 EDT
    expect(localSlotOnOrAfter(early, NY, 9).toISOString()).toBe(
      '2026-10-20T13:00:00.000Z',
    );
    const late = new Date('2026-10-20T18:00:00Z'); // 14:00 EDT
    expect(localSlotOnOrAfter(late, NY, 9).toISOString()).toBe(
      '2026-10-21T13:00:00.000Z',
    );
  });

  it('localIsoDate is the local calendar day', () => {
    expect(localIsoDate(new Date('2026-10-20T02:00:00Z'), NY)).toBe(
      '2026-10-19',
    );
  });
});

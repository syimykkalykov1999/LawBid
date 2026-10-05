import {
  afterHoursText,
  escalate,
  isOpen,
  localDayHour,
  nextOpening,
  slaDueAt,
  slaMinutesFor,
  type SupportHours,
} from './support-hours';

const WEEKDAYS: SupportHours = {
  alwaysOpen: false,
  days: [1, 2, 3, 4, 5],
  fromHour: 9,
  toHour: 18,
  timeZone: 'America/Chicago',
};

describe('support hours (owner 2026-10-05)', () => {
  it('reads the local weekday and hour', () => {
    // 2026-10-05 is a Monday; 15:00 UTC = 10:00 in Chicago (CDT).
    expect(
      localDayHour(new Date('2026-10-05T15:00:00Z'), 'America/Chicago'),
    ).toEqual({ day: 1, hour: 10 });
    expect(localDayHour(new Date('2026-10-05T15:00:00Z'), 'Nope/Zone')).toEqual(
      { day: 1, hour: 15 },
    );
  });

  it('is always open in 24/7 mode', () => {
    expect(
      isOpen(
        { ...WEEKDAYS, alwaysOpen: true },
        new Date('2026-10-04T08:00:00Z'),
      ),
    ).toBe(true);
  });

  it('knows working hours and the next opening', () => {
    expect(isOpen(WEEKDAYS, new Date('2026-10-05T15:00:00Z'))).toBe(true);
    // Sunday evening Chicago → Monday 09:00 CDT = 14:00 UTC.
    const sunday = new Date('2026-10-04T23:30:00Z');
    expect(isOpen(WEEKDAYS, sunday)).toBe(false);
    expect(nextOpening(WEEKDAYS, sunday).toISOString()).toBe(
      '2026-10-05T14:00:00.000Z',
    );
    // Friday 18:00 CDT → Monday 09:00.
    expect(
      nextOpening(WEEKDAYS, new Date('2026-10-09T23:00:00Z')).toISOString(),
    ).toBe('2026-10-12T14:00:00.000Z');
  });

  it('starts the SLA clock at the opening', () => {
    expect(
      slaDueAt(WEEKDAYS, new Date('2026-10-04T23:30:00Z'), 60).toISOString(),
    ).toBe('2026-10-05T15:00:00.000Z');
    const open = new Date('2026-10-05T15:10:00Z');
    expect(slaDueAt(WEEKDAYS, open, 30).toISOString()).toBe(
      '2026-10-05T15:40:00.000Z',
    );
  });

  it('gives urgent tickets the short SLA and escalates one step', () => {
    expect(slaMinutesFor('urgent', 60, 15)).toBe(15);
    expect(slaMinutesFor('high', 60, 15)).toBe(15);
    expect(slaMinutesFor('normal', 60, 15)).toBe(60);
    expect(escalate('low')).toBe('normal');
    expect(escalate('normal')).toBe('high');
    expect(escalate('urgent')).toBe('urgent');
  });

  it('answers after hours in the user language', () => {
    const at = new Date('2026-10-05T14:00:00Z');
    expect(afterHoursText('ru', at, 'America/Chicago')).toContain(
      'нерабочее время',
    );
    expect(afterHoursText('en', at, 'America/Chicago')).toContain('Monday');
    expect(afterHoursText('zz', at, 'America/Chicago')).toContain(
      'Support is offline',
    );
  });
});

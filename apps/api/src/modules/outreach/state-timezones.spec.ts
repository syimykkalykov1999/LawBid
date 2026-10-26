import {
  callWindow,
  describeCallWindow,
  localHourMinute,
  STATE_TIMEZONES,
} from './state-timezones';

const settings = { callHoursStart: 8, callHoursEnd: 21 };

describe('outreach: state call windows (TCPA)', () => {
  it('maps the 50 states and DC', () => {
    expect(Object.keys(STATE_TIMEZONES)).toHaveLength(51);
    expect(STATE_TIMEZONES.AZ).toBe('America/Phoenix');
    expect(STATE_TIMEZONES.HI).toBe('Pacific/Honolulu');
    expect(STATE_TIMEZONES.AK).toBe('America/Anchorage');
    expect(STATE_TIMEZONES.FL).toBe('America/New_York');
    expect(STATE_TIMEZONES.TN).toBe('America/Chicago');
    expect(STATE_TIMEZONES.ID).toBe('America/Denver');
    expect(STATE_TIMEZONES.OR).toBe('America/Los_Angeles');
  });

  it('reads the local hour through Intl', () => {
    // 2026-07-01 02:15 UTC = 22:15 EDT the day before.
    const now = new Date('2026-07-01T02:15:00Z');
    expect(localHourMinute(now, 'America/New_York')).toEqual({
      hour: 22,
      minute: 15,
    });
    expect(localHourMinute(now, 'America/Los_Angeles')).toEqual({
      hour: 19,
      minute: 15,
    });
  });

  it('allows a call inside the window in the lead state and refuses outside', () => {
    // 15:30 UTC in January = 10:30 EST / 07:30 PST.
    const now = new Date('2026-01-15T15:30:00Z');
    const ny = callWindow('NY', settings, now);
    expect(ny).toMatchObject({
      allowed: true,
      zone: 'America/New_York',
      localTime: '10:30',
    });
    const ca = callWindow('ca', settings, now);
    expect(ca).toMatchObject({
      allowed: false,
      zone: 'America/Los_Angeles',
      localTime: '07:30',
    });
    expect(describeCallWindow(ca)).toBe(
      '08:00–21:00 America/Los_Angeles, now 07:30',
    );
  });

  it('closes Florida at 20:00 (Florida Telephone Solicitation Act)', () => {
    // 00:30 UTC in July = 20:30 EDT.
    const now = new Date('2026-07-02T00:30:00Z');
    expect(callWindow('GA', settings, now).allowed).toBe(true);
    const fl = callWindow('FL', settings, now);
    expect(fl.allowed).toBe(false);
    expect(fl.end).toBe(20);
    expect(describeCallWindow(fl)).toBe(
      '08:00–20:00 America/New_York, now 20:30',
    );
  });

  it('ignores daylight saving in Arizona', () => {
    // 15:30 UTC in July = 08:30 MST (Phoenix, no DST), 09:30 MDT (Denver).
    const now = new Date('2026-07-15T15:30:00Z');
    expect(callWindow('AZ', settings, now).localTime).toBe('08:30');
    expect(callWindow('CO', settings, now).localTime).toBe('09:30');
  });

  it('is conservative for an unknown state: Pacific start and Eastern end', () => {
    // 17:00 UTC in January = 12:00 EST / 09:00 PST → allowed.
    const noon = new Date('2026-01-15T17:00:00Z');
    expect(callWindow(null, settings, noon)).toMatchObject({
      allowed: true,
      zone: null,
      localTime: '11:00',
    });
    // 15:00 UTC = 10:00 EST / 07:00 PST → too early on the West coast.
    const early = new Date('2026-01-15T15:00:00Z');
    expect(callWindow('ZZ', settings, early).allowed).toBe(false);
    // 02:30 UTC = 21:30 EST (prev day) / 18:30 PST → too late on the East.
    const late = new Date('2026-01-16T02:30:00Z');
    expect(callWindow(undefined as unknown as null, settings, late)).toEqual(
      expect.objectContaining({ allowed: false, zone: null }),
    );
  });

  it('respects a narrower configured window', () => {
    const now = new Date('2026-01-15T15:30:00Z'); // 10:30 EST
    expect(
      callWindow('NY', { callHoursStart: 11, callHoursEnd: 18 }, now),
    ).toMatchObject({ allowed: false, localTime: '10:30' });
  });
});

import type { OutreachSettings } from './outreach.settings';

/**
 * Owner 2026-10-05 (legal): the TCPA allows telemarketing calls only
 * between 8:00 and 21:00 in the *called party's* local time, so the
 * call window is checked against the lead's state. The 50 states + DC
 * mapped to an IANA zone; states split between zones use the zone where
 * most people live (FL, MI, IN, KY → Eastern; TN, ND, SD, NE, KS, TX →
 * Central; ID → Mountain; OR → Pacific).
 */
export const STATE_TIMEZONES: Readonly<Record<string, string>> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/New_York',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/New_York',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
};

const EASTERN = 'America/New_York';
const CENTRAL = 'America/Chicago';
const PACIFIC = 'America/Los_Angeles';

/** Florida Telephone Solicitation Act: no solicitation calls after 20:00. */
const FLORIDA_LAST_HOUR = 20;

export interface CallWindow {
  allowed: boolean;
  /** The lead's zone; null when the state is unknown. */
  zone: string | null;
  /** "HH:MM" in the lead's zone (Central when unknown). */
  localTime: string;
  /** The effective window (hours) after state-specific limits. */
  start: number;
  end: number;
}

/** Local hour and minute in `zone`, via Intl (no dependency). */
export function localHourMinute(
  now: Date,
  zone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const num = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Some ICU builds print "24" for midnight even with h23.
  return { hour: num('hour') % 24, minute: num('minute') };
}

/** "08:00" / "22:15". */
export const hhmm = (h: number, m = 0): string =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * Whether a call to a lead in `stateCode` is allowed at `now` under the
 * configured local call hours. Unknown or missing state → conservative:
 * allowed only when it is already past the start hour on the Pacific
 * coast AND still before the end hour on the Eastern coast.
 */
export function callWindow(
  stateCode: string | null,
  settings: Pick<OutreachSettings, 'callHoursStart' | 'callHoursEnd'>,
  now: Date = new Date(),
): CallWindow {
  const state = stateCode ? stateCode.toUpperCase() : null;
  const zone = state ? (STATE_TIMEZONES[state] ?? null) : null;
  const start = settings.callHoursStart;
  const end =
    state === 'FL'
      ? Math.min(settings.callHoursEnd, FLORIDA_LAST_HOUR)
      : settings.callHoursEnd;
  if (zone) {
    const { hour, minute } = localHourMinute(now, zone);
    return {
      allowed: hour >= start && hour < end,
      zone,
      localTime: hhmm(hour, minute),
      start,
      end,
    };
  }
  const pacific = localHourMinute(now, PACIFIC).hour;
  const eastern = localHourMinute(now, EASTERN).hour;
  const central = localHourMinute(now, CENTRAL);
  return {
    allowed: pacific >= start && eastern < end,
    zone: null,
    localTime: hhmm(central.hour, central.minute),
    start,
    end,
  };
}

/** "08:00–21:00 America/New_York, now 22:15" for the lead detail. */
export function describeCallWindow(w: CallWindow): string {
  return `${hhmm(w.start)}–${hhmm(w.end)} ${w.zone ?? 'US (unknown state)'}, now ${w.localTime}`;
}

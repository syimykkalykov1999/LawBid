import type { AppSettingsService } from '../app-settings/app-settings.service';
import { isValidTimeZone, zonedParts, zonedToUtc } from './zoned-time';

/**
 * Owner 14.11 (row 180, detective R3A-11): «Сегодня», the staff KPI days and
 * the other admin day cuts follow ONE report time zone, as Stripe's
 * «Reporting timezone» (Settings → Business) and Uber's driver stats do —
 * not UTC midnight, which in Nevada starts «tomorrow» at 4–5 pm.
 * Intl only (zoned-time.ts), DST included: a local day is 23–25 hours.
 */
export const REPORT_TIME_ZONE_KEY = 'admin.report_timezone';
export const DEFAULT_REPORT_TIME_ZONE = 'America/Los_Angeles';

/** The owner's report zone; a missing or unknown value → the default. */
export async function reportTimeZone(
  settings: Pick<AppSettingsService, 'string'> | undefined,
): Promise<string> {
  const tz = await settings
    ?.string(REPORT_TIME_ZONE_KEY)
    .catch(() => DEFAULT_REPORT_TIME_ZONE);
  return isValidTimeZone(tz) ? tz : DEFAULT_REPORT_TIME_ZONE;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of the local day [at] falls in. */
export function reportDayKey(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The instant the local day of [at] began (local midnight). */
export function reportDayStart(at: Date, timeZone: string): Date {
  const p = zonedParts(at, timeZone);
  return zonedToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** [from, to) of the local day [day] (YYYY-MM-DD). */
export function reportDayBounds(
  day: string,
  timeZone: string,
): { from: Date; to: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    from: zonedToUtc({ year: y, month: m, day: d }, timeZone),
    to: zonedToUtc(
      {
        year: next.getUTCFullYear(),
        month: next.getUTCMonth() + 1,
        day: next.getUTCDate(),
      },
      timeZone,
    ),
  };
}

/** The last complete local day before [now] (YYYY-MM-DD). */
export function previousReportDay(now: Date, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  const prev = new Date(Date.UTC(p.year, p.month - 1, p.day - 1));
  return prev.toISOString().slice(0, 10);
}

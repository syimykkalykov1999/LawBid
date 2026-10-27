/**
 * Owner 2026-10-24: where a bar license is on its renewal calendar.
 *  - ok          more than the longest reminder threshold left (or no date)
 *  - expiring    inside the reminder window, still valid
 *  - renewal_due the date passed; inside the grace period. The badge is
 *                hidden and the admin sees «требует продления», but the
 *                license and the account keep working
 *  - expired     the grace period is over (license_status = expired)
 * Only a license that was verified (or already expired) has a state.
 */
export type LicenseRenewalState =
  'ok' | 'expiring' | 'renewal_due' | 'expired' | null;

export const LICENSE_EXPIRY_SOURCES = [
  'registry',
  'attorney',
  'admin',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of [now] — `attorney_licenses.expires_at` is a DATE. */
export function utcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function licenseRenewalState(
  licenseStatus: string,
  expiresAt: Date | null,
  now: Date,
  opts: { graceDays: number; notifyDays: readonly number[] },
): LicenseRenewalState {
  if (licenseStatus === 'expired') return 'expired';
  if (licenseStatus !== 'verified' || !expiresAt) return null;
  const left = Math.round(
    (utcDay(expiresAt).getTime() - utcDay(now).getTime()) / DAY_MS,
  );
  if (left > 0) {
    const horizon = Math.max(0, ...opts.notifyDays);
    return left <= horizon ? 'expiring' : 'ok';
  }
  return -left < opts.graceDays ? 'renewal_due' : 'expired';
}

/** A verified license whose date has passed no longer backs the badge. */
export function licenseIsLapsed(
  licenseStatus: string,
  expiresAt: Date | null,
  now: Date,
): boolean {
  return (
    licenseStatus === 'verified' &&
    expiresAt !== null &&
    utcDay(expiresAt).getTime() <= utcDay(now).getTime()
  );
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * "Mar 2028" (NY `next_registration`) → 2028-03-31, the last day of the
 * month the next registration falls due. null when it is not month/year.
 */
export function registryMonthEnd(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\s*$/.exec(value);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx < 0) return null;
  return new Date(Date.UTC(Number(m[2]), idx + 1, 0))
    .toISOString()
    .slice(0, 10);
}

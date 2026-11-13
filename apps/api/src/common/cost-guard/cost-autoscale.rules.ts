import {
  COST_PROVIDERS,
  COST_WINDOWS,
  type CostProvider,
  type CostWindow,
} from './cost-guard.constants';

/**
 * Owner 2026-10-05 «лимиты увеличиваются по росту и уменьшаются по
 * снижению»: pure rules behind the automatic spend caps (no I/O — unit
 * tested in cost-autoscale.rules.spec.ts). CostAutoscaleService feeds them
 * the usage history and writes the result into the ordinary
 * `budget.<provider>.<suffix>` app_config rows CostGuardService reads.
 */

/** app_config row holding the auto/manual settings of every cap. */
export const AUTOSCALE_CONFIG_KEY = 'budget.autoscale';

/** Largest cap/floor/ceiling the admin may set (same as config-schema). */
export const AUTOSCALE_MAX_VALUE = 10_000_000;

/** Default ceiling = floor × this (when the admin never set one). */
export const AUTOSCALE_DEFAULT_CEILING_FACTOR = 10;

/** Days of daily history the rules look at for the peak. */
export const AUTOSCALE_PEAK_DAYS = 7;

/** Daily history kept in Redis (days). */
export const AUTOSCALE_HISTORY_DAYS = 40;

export type AutoscaleMode = 'auto' | 'manual';

export interface WindowSetting {
  mode: AutoscaleMode;
  floor: number;
  ceiling: number;
}

export type ProviderSettings = Record<CostWindow, WindowSetting>;
export type AutoscaleSettings = Record<CostProvider, ProviderSettings>;

function asCap(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n <= AUTOSCALE_MAX_VALUE
    ? n
    : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parses the `budget.autoscale` JSON field by field; anything missing or
 * malformed falls back to the default: mode `auto`, floor = the env
 * default of that cap, ceiling = floor × 10. One exception keeps an
 * explicit switch-off: a cap stored as 0 (provider disabled) with no
 * autoscale entry yet stays `manual`, so turning autoscale on by default
 * never silently re-enables a provider the owner had turned off.
 */
export function parseAutoscaleSettings(
  raw: unknown,
  envDefault: (provider: CostProvider, window: CostWindow) => number,
  storedCap: (
    provider: CostProvider,
    window: CostWindow,
  ) => number | undefined = () => undefined,
): AutoscaleSettings {
  const root = isRecord(raw) ? raw : {};
  const out = {} as AutoscaleSettings;
  for (const provider of COST_PROVIDERS) {
    const p = isRecord(root[provider]) ? root[provider] : {};
    out[provider] = {} as ProviderSettings;
    for (const window of COST_WINDOWS) {
      const w = isRecord(p[window]) ? p[window] : undefined;
      const env = envDefault(provider, window);
      const floor = asCap(w?.floor) ?? env;
      const ceiling =
        asCap(w?.ceiling) ??
        Math.min(
          AUTOSCALE_MAX_VALUE,
          Math.max(floor, 1) * AUTOSCALE_DEFAULT_CEILING_FACTOR,
        );
      const mode: AutoscaleMode =
        w?.mode === 'auto' || w?.mode === 'manual'
          ? w.mode
          : storedCap(provider, window) === 0
            ? 'manual'
            : 'auto';
      out[provider][window] = { mode, floor, ceiling };
    }
  }
  return out;
}

/** `yyyymmdd` of a UTC date (the CostGuard daily-key stamp). */
export function dayStamp(at: Date): string {
  const iso = at.toISOString();
  return iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10);
}

function utcDay(at: Date, offsetDays: number): Date {
  return new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate() + offsetDays,
    ),
  );
}

export function daysInMonth(at: Date): number {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

export interface UsageSummary {
  /** Most units in one UTC day over the last 7 days (today included). */
  dailyPeak: number;
  /** Units this calendar month so far. */
  monthToDate: number;
  /** Units the whole previous calendar month (what history still holds). */
  lastMonthTotal: number;
  /** Days of this month started so far (today = 1 on the 1st). */
  elapsedDays: number;
  daysInMonth: number;
}

/**
 * Summarises the daily history (`yyyymmdd` → units, today included).
 * `monthCounter` is the live monthly CostGuard counter: the history may
 * be younger than the month (fresh install), so the larger of the two
 * wins for month-to-date.
 */
export function summarizeUsage(
  history: Record<string, number>,
  now: Date,
  monthCounter = 0,
): UsageSummary {
  const val = (stamp: string) => {
    const n = history[stamp];
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
  };
  let dailyPeak = 0;
  for (let i = 0; i < AUTOSCALE_PEAK_DAYS; i++) {
    dailyPeak = Math.max(dailyPeak, val(dayStamp(utcDay(now, -i))));
  }
  const thisMonth = dayStamp(now).slice(0, 6);
  const prevMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const prevMonth = dayStamp(prevMonthDate).slice(0, 6);
  let fromHistory = 0;
  let lastMonthTotal = 0;
  for (const stamp of Object.keys(history)) {
    if (stamp.startsWith(thisMonth)) fromHistory += val(stamp);
    else if (stamp.startsWith(prevMonth)) lastMonthTotal += val(stamp);
  }
  return {
    dailyPeak,
    monthToDate: Math.max(fromHistory, monthCounter > 0 ? monthCounter : 0),
    lastMonthTotal,
    elapsedDays: now.getUTCDate(),
    daysInMonth: daysInMonth(now),
  };
}

export interface WindowTarget {
  /** What the rule asks for before the floor/ceiling. */
  target: number;
  /** The cap to apply: target clamped to [floor, ceiling]. */
  value: number;
  /** Which bound clamped it, if any. */
  clampedBy: 'floor' | 'ceiling' | null;
}

/**
 * The automatic caps for one provider:
 * - daily = 2 × the busiest day of the last week;
 * - monthly = 1.5 × max(last month, this month's projection), and never
 *   below the daily cap (projection = month-to-date ÷ max(days, 3) × days
 *   in month — the first days of a month don't extrapolate wildly);
 * - per minute = 30 × the average per-minute rate of the busiest day
 *   (room for bursts);
 * each clamped to [floor, ceiling] (a ceiling below the floor wins: it
 * is the safety limit).
 */
export function computeTargets(
  usage: UsageSummary,
  bounds: Record<CostWindow, { floor: number; ceiling: number }>,
): Record<CostWindow, WindowTarget> {
  const daily = Math.ceil(usage.dailyPeak * 2);
  const projected =
    (usage.monthToDate / Math.max(usage.elapsedDays, 3)) * usage.daysInMonth;
  const monthly = Math.max(
    Math.ceil(Math.max(usage.lastMonthTotal, projected) * 1.5),
    daily,
  );
  const minute = Math.ceil((usage.dailyPeak / 1440) * 30);
  const raw: Record<CostWindow, number> = { minute, daily, monthly };
  const out = {} as Record<CostWindow, WindowTarget>;
  for (const window of COST_WINDOWS) {
    const { floor, ceiling } = bounds[window];
    const target = raw[window];
    let value = target;
    let clampedBy: WindowTarget['clampedBy'] = null;
    if (value < floor) {
      value = floor;
      clampedBy = 'floor';
    }
    if (value > ceiling) {
      value = ceiling;
      clampedBy = 'ceiling';
    }
    out[window] = { target, value, clampedBy };
  }
  return out;
}

/** History fields (`yyyymmdd`) older than the retention, for HDEL. */
export function staleHistoryFields(
  fields: readonly string[],
  now: Date,
  keepDays = AUTOSCALE_HISTORY_DAYS,
): string[] {
  const oldest = dayStamp(utcDay(now, -(keepDays - 1)));
  return fields.filter((f) => !/^\d{8}$/.test(f) || f < oldest);
}

/**
 * Item 27 (AU1, owner decision 25.11): when the ECS predictive scaling policy
 * of the api may scale (ForecastAndScale) instead of only forecasting
 * (ForecastOnly). Pure: no AWS, no clock.
 *
 * Sources (AWS, ECS developer guide, checked 25.11.2026):
 * - "Use historical patterns to scale Amazon ECS services with predictive
 *   scaling": start in forecast only, evaluate the forecast, then switch;
 *   two weeks of history is ideal; predictive never scales in, the target-
 *   tracking policies stay (the larger desired count wins).
 * - "Evaluate your predictive scaling policies": compare the hourly load
 *   forecast with the actual observed load (SUM of the load metric per hour).
 * Netflix Scryer (2013) and the SREcon25 talk use the same rule: let the
 * forecast act only after it has been right for a while.
 *
 * The error of one day is the WAPE (weighted absolute percentage error):
 * sum |forecast - actual| / sum actual. Unlike the mean of per-hour
 * percentages it does not explode on a quiet night hour with 3 requests.
 */

/** The admin's choice (`infra.predictive_scaling_mode`). */
export type PredictiveSetting = 'forecast' | 'on' | 'auto';
export type PredictiveMode = 'ForecastOnly' | 'ForecastAndScale';

/** One whole UTC day with data on both sides. */
export interface DayError {
  /** YYYY-MM-DD (UTC). */
  day: string;
  /** WAPE in percent. */
  errorPct: number;
  /** Hours of the day with both a forecast and an actual value. */
  hours: number;
}

/** An unknown or misspelt value is «forecast»: it never adds tasks (like
 * ha.mode, where a typo means hands off). `off` is the same as forecast:
 * a ForecastOnly policy changes no task count (AWS). */
export function predictiveSetting(raw: unknown): PredictiveSetting {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'on' || v === 'auto' ? v : 'forecast';
}

/** Hours of a day needed before the day counts (a day the API was off for a
 * while, or the policy's first day, is not a measurement). */
export const MIN_HOURS_PER_DAY = 20;

const dayOf = (t: Date) => t.toISOString().slice(0, 10);

/**
 * Daily WAPE of a forecast against what really came, oldest day first.
 * Both series are hourly (the forecast timestamps are the start of each
 * hour; the actual values come from GetMetricData with Period 3600). Only
 * whole days before `today` count; a day with no traffic at all (sum 0) is
 * skipped, not "perfect".
 */
export function dailyErrors(
  forecast: { t: Date; v: number }[],
  actual: { t: Date; v: number }[],
  now: Date,
): DayError[] {
  const today = dayOf(now);
  const got = new Map<number, number>();
  for (const a of actual) {
    if (Number.isFinite(a.v)) got.set(a.t.getTime(), a.v);
  }
  const sums = new Map<string, { err: number; act: number; hours: number }>();
  for (const f of forecast) {
    const a = got.get(f.t.getTime());
    if (a === undefined || !Number.isFinite(f.v)) continue;
    const day = dayOf(f.t);
    if (day >= today) continue;
    const s = sums.get(day) ?? { err: 0, act: 0, hours: 0 };
    s.err += Math.abs(f.v - a);
    s.act += a;
    s.hours += 1;
    sums.set(day, s);
  }
  return [...sums.entries()]
    .filter(([, s]) => s.hours >= MIN_HOURS_PER_DAY && s.act > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, s]) => ({
      day,
      errorPct: Math.round((1000 * s.err) / s.act) / 10,
      hours: s.hours,
    }));
}

/** The last `n` calendar days before `now` are all present (no gap). */
function lastDaysComplete(days: DayError[], n: number, now: Date): boolean {
  if (n <= 0) return true;
  const have = new Set(days.map((d) => d.day));
  for (let i = 1; i <= n; i += 1) {
    const d = new Date(now.getTime() - i * 86_400_000);
    if (!have.has(dayOf(d))) return false;
  }
  return true;
}

export interface PredictiveDecision {
  mode: PredictiveMode;
  /** Short code for the log and the admin note. */
  reason:
    | 'setting_forecast'
    | 'setting_on'
    | 'auto_good_days'
    | 'auto_not_enough_days'
    | 'auto_error_high'
    | 'auto_stays_on'
    | 'auto_back_to_forecast';
}

/**
 * Авто: ForecastAndScale once each of the last `goodDays` whole days had an
 * error at or under `maxErrorPct`; back to ForecastOnly as soon as the last
 * whole day is over it (or a day is missing while on: no measurement, no
 * trust). Once on, one good day a day keeps it on (no flapping on one late
 * reading: only a measured bad day or a gap turns it off).
 */
export function decidePredictive(
  setting: PredictiveSetting,
  days: DayError[],
  maxErrorPct: number,
  goodDays: number,
  live: PredictiveMode | null,
  now: Date,
): PredictiveDecision {
  if (setting === 'forecast') {
    return { mode: 'ForecastOnly', reason: 'setting_forecast' };
  }
  if (setting === 'on')
    return { mode: 'ForecastAndScale', reason: 'setting_on' };
  const n = Math.max(1, Math.floor(goodDays));
  const recent = days.slice(-n);
  if (live === 'ForecastAndScale') {
    const last = days[days.length - 1];
    if (!last || !lastDaysComplete(days, 1, now)) {
      return { mode: 'ForecastOnly', reason: 'auto_back_to_forecast' };
    }
    return last.errorPct <= maxErrorPct
      ? { mode: 'ForecastAndScale', reason: 'auto_stays_on' }
      : { mode: 'ForecastOnly', reason: 'auto_back_to_forecast' };
  }
  if (recent.length < n || !lastDaysComplete(days, n, now)) {
    return { mode: 'ForecastOnly', reason: 'auto_not_enough_days' };
  }
  return recent.every((d) => d.errorPct <= maxErrorPct)
    ? { mode: 'ForecastAndScale', reason: 'auto_good_days' }
    : { mode: 'ForecastOnly', reason: 'auto_error_high' };
}

/** Plain Russian line for «Расходы → Реестр» and the log. */
export function predictiveNote(
  d: PredictiveDecision,
  days: DayError[],
  maxErrorPct: number,
  goodDays: number,
): string {
  const last = days[days.length - 1];
  const err = last
    ? `ошибка прогноза за ${last.day}: ${last.errorPct} % (порог ${maxErrorPct} %)`
    : 'замеров ещё нет (AWS нужны сутки истории)';
  const good = days
    .slice(-goodDays)
    .filter((x) => x.errorPct <= maxErrorPct).length;
  const mode =
    d.mode === 'ForecastAndScale'
      ? 'Прогноз добавляет серверы заранее'
      : 'Только прогноз, серверы не трогает';
  const tail =
    d.reason === 'auto_not_enough_days' || d.reason === 'auto_error_high'
      ? `; хороших дней подряд ${good} из ${goodDays}`
      : '';
  return `${mode}: ${err}${tail}.`;
}

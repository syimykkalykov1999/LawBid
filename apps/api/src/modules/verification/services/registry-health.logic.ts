import type { CheckOutcome } from '../providers/verification-providers';
import { RegistryGuardError } from '../providers/bar-lookup/registry-guard';

/**
 * Owner row 50 (13.11): a state bar site that changed its page or blocks us
 * must not silently turn into «not found». Data-feed monitoring as payment /
 * background-check companies run it for their upstream sources: per source
 * (state) success / not-found / error counts in hourly buckets, the current
 * window compared with the source's own 7-day baseline, a «degraded» mark on
 * a jump, an alert to the owner on the change, and back to normal by itself.
 *
 * Pure functions only; RegistryHealthService does the Redis and the logging.
 */

export type HealthKind = 'ok' | 'not_found' | 'error';

export const HEALTH_KINDS: readonly HealthKind[] = ['ok', 'not_found', 'error'];

/** Hours of history kept: the window plus the 7-day baseline, plus slack. */
export const BASELINE_HOURS = 7 * 24;
export const KEEP_HOURS = BASELINE_HOURS + 48;

export interface HealthConfig {
  /** Hours of the current window (default 24). */
  windowHours: number;
  /** Fewer checks than this in the window decide nothing (default 5). */
  minChecks: number;
  /** Percentage points the window's rate must exceed the baseline's by
   * (default 50). */
  jumpPoints: number;
}

export interface Counts {
  ok: number;
  not_found: number;
  error: number;
}

export interface HealthVerdict {
  /** null = not enough checks in the window: keep whatever mark is set. */
  degraded: boolean | null;
  /** Which rate jumped (the first of error, not_found, bad). */
  kind: 'error' | 'not_found' | 'bad' | null;
  window: Counts;
  baseline: Counts;
  windowRate: { error: number; not_found: number; bad: number };
  baselineRate: { error: number; not_found: number; bad: number };
}

/**
 * What one real registry answer says about the registry itself (not about
 * the attorney). Returns null for answers that carry no news: a cached
 * answer, our own rate limit, an open circuit breaker (its failures were
 * counted when they happened).
 */
export function classifyOutcome(outcome: CheckOutcome): HealthKind | null {
  if (outcome.details?.cachedAt) return null;
  if (outcome.result === 'fail' && outcome.details?.reason === 'not_found') {
    return 'not_found';
  }
  // pass, not_active, name mismatch, status unknown: the registry answered
  // with a record, so the source works.
  return 'ok';
}

export function classifyError(err: unknown): HealthKind | null {
  if (err instanceof RegistryGuardError) return null;
  return 'error';
}

/** Hour index since the epoch (the bucket a check falls into). */
export function hourOf(ms: number): number {
  return Math.floor(ms / 3_600_000);
}

/** Field name inside the state's hash: `<hour>:<kind>`. */
export function field(hour: number, kind: HealthKind): string {
  return `${hour}:${kind}`;
}

function zero(): Counts {
  return { ok: 0, not_found: 0, error: 0 };
}

function total(c: Counts): number {
  return c.ok + c.not_found + c.error;
}

function rates(c: Counts) {
  const t = total(c);
  if (t === 0) return { error: 0, not_found: 0, bad: 0 };
  return {
    error: c.error / t,
    not_found: c.not_found / t,
    bad: (c.error + c.not_found) / t,
  };
}

/** Fields older than the kept history (to HDEL). */
export function staleFields(
  hash: Record<string, string>,
  nowHour: number,
): string[] {
  return Object.keys(hash).filter((f) => {
    const h = Number(f.split(':')[0]);
    return !Number.isFinite(h) || h <= nowHour - KEEP_HOURS;
  });
}

/**
 * The window is the last `windowHours` hours (current hour included); the
 * baseline the 7 days before it. A rate «jumps» when it is at least
 * `jumpPoints` percentage points above the baseline's rate. Degraded when
 * the error rate, the not-found rate or both together jump; healthy when
 * the window has enough checks and nothing jumps.
 *
 * [degradedSinceHour]: while a mark is set, the hours since it was set never
 * count as baseline (KNOWN_ERRORS 144: a «needed» signal must not depend on
 * the thing it measures; otherwise a long outage becomes its own baseline
 * and the mark clears itself while the site is still broken).
 */
export function evaluateHealth(
  hash: Record<string, string>,
  nowHour: number,
  cfg: HealthConfig,
  degradedSinceHour: number | null = null,
): HealthVerdict {
  const windowHours = Math.max(1, Math.floor(cfg.windowHours));
  const window = zero();
  const baseline = zero();
  for (const [f, v] of Object.entries(hash)) {
    const [h, kind] = f.split(':');
    const hour = Number(h);
    const n = Number(v);
    if (!Number.isFinite(hour) || !Number.isFinite(n) || n <= 0) continue;
    if (!(HEALTH_KINDS as readonly string[]).includes(kind)) continue;
    const age = nowHour - hour;
    if (age < 0) continue;
    if (age < windowHours) window[kind as HealthKind] += n;
    else if (
      age < windowHours + BASELINE_HOURS &&
      (degradedSinceHour === null || hour < degradedSinceHour)
    )
      baseline[kind as HealthKind] += n;
  }
  const w = rates(window);
  const b = rates(baseline);
  const base = {
    window,
    baseline,
    windowRate: w,
    baselineRate: b,
  };
  if (total(window) < Math.max(1, cfg.minChecks)) {
    return { degraded: null, kind: null, ...base };
  }
  const jump = Math.max(0, cfg.jumpPoints) / 100;
  const order = ['error', 'not_found', 'bad'] as const;
  const kind = order.find((k) => w[k] > 0 && w[k] - b[k] >= jump) ?? null;
  return { degraded: kind !== null, kind, ...base };
}

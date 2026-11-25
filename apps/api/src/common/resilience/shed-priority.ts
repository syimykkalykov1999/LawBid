import { SetMetadata } from '@nestjs/common';

/**
 * Item 21 (A3 / AU2, docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md):
 * request priority for load shedding, the four levels of Netflix's shared
 * load-shedding library (InfoQ 23.11.2024, «Enhancing Netflix Reliability
 * with Service-Level Prioritized Load Shedding»): critical, degraded,
 * best-effort, bulk. Google SRE book ch. 21 «Handling Overload» has the same
 * idea as CRITICAL_PLUS / CRITICAL / SHEDDABLE_PLUS / SHEDDABLE.
 *
 * - critical: sign-in, payments, call signalling, sending a message;
 * - degraded: every other request a person makes (the default);
 * - best_effort: previews, suggestions while typing, prefetch;
 * - bulk: analytics, background batches.
 *
 * Lower priorities are shed first; critical only at the top threshold.
 */
export const SHED_PRIORITIES = [
  'bulk',
  'best_effort',
  'degraded',
  'critical',
] as const;
export type ShedPriorityLevel = (typeof SHED_PRIORITIES)[number];

export const SHED_PRIORITY_KEY = 'lawbid:shed-priority';

/** Marks a controller or a route with its shedding priority. */
export const ShedPriority = (level: ShedPriorityLevel) =>
  SetMetadata(SHED_PRIORITY_KEY, level);

/**
 * The app (or a web page) may LOWER a request's priority with
 * `X-Request-Priority: prefetch | background` — never raise it (Netflix,
 * InfoQ 20.11.2025: services may degrade a priority, not escalate it).
 */
export const PRIORITY_HEADER = 'x-request-priority';

const HEADER_LEVEL: Record<string, ShedPriorityLevel> = {
  prefetch: 'best_effort',
  best_effort: 'best_effort',
  background: 'bulk',
  bulk: 'bulk',
  degraded: 'degraded',
};

export function rank(level: ShedPriorityLevel): number {
  return SHED_PRIORITIES.indexOf(level);
}

/** Route level, lowered (never raised) by the client header. */
export function effectivePriority(
  routeLevel: ShedPriorityLevel | undefined,
  header: unknown,
  path: string,
): ShedPriorityLevel {
  // The owner's admin stays reachable during overload (owner rule: no
  // limits on the owner); the admin panel's routes count as critical.
  const base =
    routeLevel ??
    (/^\/api\/v1\/admin(\/|$)/.test(path) ? 'critical' : 'degraded');
  const raw: unknown = Array.isArray(header)
    ? (header as unknown[])[0]
    : header;
  const asked =
    typeof raw === 'string'
      ? HEADER_LEVEL[raw.trim().toLowerCase()]
      : undefined;
  if (!asked) return base;
  return rank(asked) < rank(base) ? asked : base;
}

/**
 * Threshold at which `level` starts being shed on one signal, Netflix
 * style: the lowest priority at `start`, critical at `critical`, the levels
 * between evenly in between («as system load increases, more critical
 * traffic is progressively shed»). `start` 0 or not below `critical` = one
 * threshold for all (the pre-priority behaviour).
 */
export function tierThreshold(
  level: ShedPriorityLevel,
  start: number,
  critical: number,
): number {
  if (!(start > 0) || start >= critical) return critical;
  const step = rank(level) / (SHED_PRIORITIES.length - 1);
  return start + (critical - start) * step;
}

export type ShedMode = 'off' | 'on' | 'auto';

export interface ShedSignals {
  /** p99 event-loop delay, ms (sustained: the smaller of the last two seconds). */
  lagMs: number;
  /** Event-loop utilization 0–100 % (the Node main thread's CPU). */
  cpuPct: number;
  /** Requests in flight on this instance, without the one being decided. */
  inFlight: number;
  /** Concurrency limit (adaptive in Авто, fixed in Вкл); 0 = none. */
  limit: number;
}

export interface ShedThresholds {
  mode: ShedMode;
  /** Critical threshold of the event-loop lag, ms; 0 = signal off. */
  lagCriticalMs: number;
  /** Lowest-priority lag threshold, ms (0 = same as critical). */
  lagStartMs: number;
  /** Critical CPU threshold, %; 0 = signal off. */
  cpuCriticalPct: number;
  /** Lowest-priority CPU threshold, % (0 = same as critical). */
  cpuStartPct: number;
  /** Lowest priority starts at this share of the concurrency limit, %. */
  inFlightStartPct: number;
}

export type ShedReason = 'event_loop_lag' | 'cpu' | 'in_flight';

/**
 * Pure decision (unit tested). Авто follows Netflix (InfoQ 23.11.2024):
 * the concurrency limit only sheds once CPU is above the start threshold,
 * which sits above the autoscaling CPU target, so autoscaling still sees
 * the load and adds servers first. Вкл applies every threshold as set.
 */
export function shedDecision(
  level: ShedPriorityLevel,
  s: ShedSignals,
  t: ShedThresholds,
): ShedReason | null {
  if (t.mode === 'off') return null;
  if (t.lagCriticalMs > 0) {
    if (s.lagMs > tierThreshold(level, t.lagStartMs, t.lagCriticalMs)) {
      return 'event_loop_lag';
    }
  }
  if (t.cpuCriticalPct > 0) {
    if (s.cpuPct > tierThreshold(level, t.cpuStartPct, t.cpuCriticalPct)) {
      return 'cpu';
    }
  }
  if (s.limit > 0) {
    const cpuGateOpen =
      t.mode === 'on' ||
      t.cpuCriticalPct <= 0 ||
      s.cpuPct >= (t.cpuStartPct > 0 ? t.cpuStartPct : t.cpuCriticalPct);
    const start =
      t.inFlightStartPct > 0 && t.inFlightStartPct < 100
        ? (s.limit * t.inFlightStartPct) / 100
        : 0;
    if (cpuGateOpen && s.inFlight >= tierThreshold(level, start, s.limit)) {
      return 'in_flight';
    }
  }
  return null;
}

import { Injectable } from '@nestjs/common';
import type { CheckOutcome } from '../verification-providers';
import { normalizeName } from './registry-http';
import { RegistryRateLimitedError } from './registry-session';

/**
 * Owner 2026-10-28 (polite use of the states' public registries):
 *  - cache: the same number + name is answered from memory for 24 h;
 *  - rate limit: at most N lookups a minute per state (default 10);
 *  - circuit breaker: 5 failures in a row stop lookups to that state for
 *    10 min; an HTTP 429 stops them for the site's Retry-After (at least
 *    1 min, doubling up to 1 h while it repeats) — Florida's Cloudflare.
 * A blocked lookup throws [RegistryGuardError]; the caller turns every
 * error into `manual_review`, so the attorney is never blocked.
 *
 * State is per API process (no Redis round trip): with N API tasks the
 * worst case is N × the limit, still a handful of requests a minute.
 */

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;
const WINDOW_MS = 60_000;
export const BREAKER_FAILURES = 5;
export const BREAKER_OPEN_MS = 10 * 60_000;
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

export class RegistryGuardError extends Error {
  constructor(
    readonly kind: 'rate_limited' | 'circuit_open',
    message: string,
  ) {
    super(message);
  }
}

interface Breaker {
  failures: number;
  openUntil: number;
  backoffMs: number;
}

export interface GuardOptions {
  /** Requests per minute for this state. */
  ratePerMin: number;
  /** Admin "Проверить": fresh answer, and a test may probe an open breaker. */
  fresh?: boolean;
}

@Injectable()
export class RegistryGuard {
  private readonly cache = new Map<string, { at: number; out: CheckOutcome }>();
  private readonly hits = new Map<string, number[]>();
  private readonly breakers = new Map<string, Breaker>();

  /** Clock (tests replace it). */
  now: () => number = Date.now;

  /** Cache key: state, adapter, number and the names it was compared to. */
  static key(
    state: string,
    adapter: string,
    input: { barNumber: string; firstName: string; lastName: string },
  ): string {
    return [
      state,
      adapter,
      input.barNumber.trim().toUpperCase(),
      normalizeName(input.firstName),
      normalizeName(input.lastName),
    ].join('|');
  }

  async run(
    state: string,
    key: string,
    opts: GuardOptions,
    call: () => Promise<CheckOutcome>,
  ): Promise<CheckOutcome> {
    const now = this.now();
    if (!opts.fresh) {
      const hit = this.cache.get(key);
      if (hit && now - hit.at < CACHE_TTL_MS) {
        return {
          ...hit.out,
          details: {
            ...hit.out.details,
            cachedAt: new Date(hit.at).toISOString(),
          },
        };
      }
      const b = this.breakers.get(state);
      if (b && b.openUntil > now) {
        throw new RegistryGuardError(
          'circuit_open',
          `The ${state} registry is paused after errors until ${new Date(b.openUntil).toISOString()}`,
        );
      }
    }
    this.take(state, opts.ratePerMin, now);
    try {
      const out = await call();
      this.succeeded(state);
      this.remember(key, out);
      return out;
    } catch (e) {
      this.failed(state, e);
      throw e;
    }
  }

  /** Sliding one-minute window per state. */
  private take(state: string, limit: number, now: number): void {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    const list = (this.hits.get(state) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    if (list.length >= max) {
      this.hits.set(state, list);
      throw new RegistryGuardError(
        'rate_limited',
        `More than ${max} lookups a minute to the ${state} registry`,
      );
    }
    list.push(now);
    this.hits.set(state, list);
  }

  private succeeded(state: string): void {
    this.breakers.delete(state);
  }

  private failed(state: string, e: unknown): void {
    const now = this.now();
    const b = this.breakers.get(state) ?? {
      failures: 0,
      openUntil: 0,
      backoffMs: 0,
    };
    if (e instanceof RegistryRateLimitedError) {
      const asked = (e.retryAfterSeconds ?? 0) * 1000;
      b.backoffMs = Math.min(
        BACKOFF_MAX_MS,
        Math.max(BACKOFF_MIN_MS, asked, b.backoffMs * 2),
      );
      b.openUntil = now + b.backoffMs;
      b.failures += 1;
    } else {
      b.failures += 1;
      if (b.failures >= BREAKER_FAILURES) b.openUntil = now + BREAKER_OPEN_MS;
    }
    this.breakers.set(state, b);
  }

  private remember(key: string, out: CheckOutcome): void {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), out });
  }

  /** Admin view: whether a state is paused and until when. */
  status(state: string): { pausedUntil: string | null } {
    const b = this.breakers.get(state);
    return {
      pausedUntil:
        b && b.openUntil > this.now()
          ? new Date(b.openUntil).toISOString()
          : null,
    };
  }

  /** Settings changed: forget the state's cached answers and pause. */
  reset(state: string): void {
    this.breakers.delete(state);
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(`${state}|`)) this.cache.delete(k);
    }
  }
}

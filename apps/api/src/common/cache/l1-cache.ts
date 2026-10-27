import { singleFlight } from './single-flight';

/**
 * Owner 2026-10-25 (caching round 2, S2-7): a tiny per-process memory cache
 * (L1) in front of Redis for GLOBAL, small, rarely-changing values: feature
 * flags, the plan / entitlement catalog, app settings. Every request used
 * to make 2-4 Redis round trips (0.3-1 ms each) for data that changes once
 * a day.
 *
 * - TTL 5 s by default (`CACHE_L1_TTL_SEC`, 0 = off = old behaviour). A
 *   change made on THIS instance clears the entry at once (`delete` /
 *   `clear`, called from the same hook that deletes the Redis key); a
 *   change made on another instance shows up within the TTL.
 * - Never for per-user keys (those stay in Redis only) and never for
 *   anything that must be exact (locks, counters, rate limits).
 * - Bounded (`maxEntries`) and single-flight on a miss.
 * - Off under jest (NODE_ENV=test) unless a spec passes `enabled: true`:
 *   specs reset Redis directly and expect an immediate re-read.
 */
export function defaultL1TtlMs(): number {
  const raw = process.env.CACHE_L1_TTL_SEC;
  const sec = raw === undefined || raw === '' ? 5 : Number(raw);
  return Number.isFinite(sec) && sec >= 0 ? Math.min(sec, 60) * 1000 : 5000;
}

export interface L1Options {
  ttlMs?: number;
  maxEntries?: number;
  enabled?: boolean;
  now?: () => number;
}

export class L1Cache<T> {
  private readonly map = new Map<string, { at: number; value: T }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly on: boolean;
  private readonly now: () => number;

  constructor(
    private readonly name: string,
    opts: L1Options = {},
  ) {
    this.ttlMs = opts.ttlMs ?? defaultL1TtlMs();
    this.maxEntries = opts.maxEntries ?? 200;
    this.on =
      (opts.enabled ?? process.env.NODE_ENV !== 'test') && this.ttlMs > 0;
    this.now = opts.now ?? Date.now;
  }

  get(key: string): T | undefined {
    if (!this.on) return undefined;
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() - e.at >= this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    if (!this.on) return;
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: this.now(), value });
  }

  /** The explicit invalidation hook: call it wherever the Redis key of
   * [key] is deleted. */
  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /** Memory hit, else one shared load (which usually reads Redis). */
  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    return singleFlight(`l1:${this.name}:${key}`, async () => {
      const value = await load();
      this.set(key, value);
      return value;
    });
  }
}

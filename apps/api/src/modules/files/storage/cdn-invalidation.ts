import type Redis from 'ioredis';
import type { InvalidationSender } from './cloudfront-invalidation.client';

/**
 * Owner 2026-10-25 (caching round 2, S2-1/S2-10): public photos and private
 * files stay in the CloudFront edge for up to a year / a day. When a file
 * is removed for good (moderation takedown, account erasure, a purged task)
 * the edge copy must go too.
 *
 * CloudFront bills per invalidation PATH (first 1000 a month free), so:
 *  - one wildcard path per file, `/<key>*`, covers the object, its
 *    `_w256` / `_w320` / `_w1080` size variants, the `.avif` twins and every
 *    signed-URL query string variant;
 *  - paths are queued in Redis (a set, so repeats collapse) and sent in one
 *    request per distribution by the `cdn.invalidate` cron job;
 *  - a monthly cap (`cdn.invalidate_max_paths_month`) bounds the bill.
 */
export type CdnTarget = 'media' | 'documents';

export const CDN_TARGETS: readonly CdnTarget[] = ['media', 'documents'];

const PENDING_PREFIX = 'cdn:inval:pending:';
const MONTH_PREFIX = 'cdn:inval:month:';
/** A queue nobody drains (no distribution id configured) is forgotten. */
const PENDING_TTL_SEC = 7 * 24 * 3600;
/**
 * CloudFront accepts at most 15 wildcard (`*`) paths IN PROGRESS per
 * distribution ("Quotas on invalidations", CloudFront Developer Guide); every
 * path here is a wildcard, so a bigger request is refused with
 * TooManyInvalidationsInProgress and the batch would bounce back into the
 * queue forever (deploy safety audit 2026-10-27). The admin batch setting
 * can only lower this.
 */
export const MAX_WILDCARD_PATHS_PER_REQUEST = 15;

/** `key`, `key_w320`, `key.avif`, `key_w1080.avif` → `key`. */
export function baseKeyOf(key: string): string {
  return key.replace(/(_w\d+)?(\.avif)?$/, '');
}

/** The one wildcard path that covers a file and everything derived from it. */
export function invalidationPath(key: string): string {
  return `/${baseKeyOf(key).split('/').map(encodeURIComponent).join('/')}*`;
}

/** Distinct wildcard paths for [keys] (twins of one file collapse to one). */
export function invalidationPaths(keys: string[]): string[] {
  return [...new Set(keys.map(invalidationPath))];
}

function dayKey(now: Date): string {
  return `cdn:inval:day:${now.toISOString().slice(0, 10).replace(/-/g, '')}`;
}

function monthKey(now: Date): string {
  return `${MONTH_PREFIX}${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface FlushResult {
  /** Requests sent to CloudFront. */
  requests: number;
  /** Paths sent. */
  paths: number;
  /** Paths dropped because the monthly cap was reached. */
  dropped: number;
  /** Paths put back after a CloudFront failure. */
  requeued: number;
}

export interface FlushOptions {
  /** Distribution id per target (a target without one is skipped). */
  distributions: Partial<Record<CdnTarget, string | undefined>>;
  /** Most paths in one request. */
  batchMax: number;
  /** Most paths a month over both distributions; 0 = no cap. */
  monthlyCap: number;
  /** Most paths a day (`auto` mode); 0 = no cap. */
  dailyCap?: number;
  now?: Date;
}

/** Redis-backed queue of invalidation paths (REDIS_CLIENT: the queue must
 * not be evicted, it holds the only record of a pending takedown). */
export class CdnInvalidationQueue {
  constructor(private readonly redis: Redis) {}

  async enqueue(target: CdnTarget, keys: string[]): Promise<number> {
    const paths = invalidationPaths(keys);
    if (paths.length === 0) return 0;
    const k = PENDING_PREFIX + target;
    await this.redis.sadd(k, ...paths);
    await this.redis.expire(k, PENDING_TTL_SEC);
    return paths.length;
  }

  async pending(target: CdnTarget): Promise<number> {
    return this.redis.scard(PENDING_PREFIX + target);
  }

  /** Sends at most one request per distribution. Never throws for a
   * CloudFront failure: the paths go back into the queue. */
  async flush(
    send: InvalidationSender,
    opts: FlushOptions,
    onError?: (err: unknown, target: CdnTarget) => void,
  ): Promise<FlushResult> {
    const out: FlushResult = { requests: 0, paths: 0, dropped: 0, requeued: 0 };
    const now = opts.now ?? new Date();
    const mk = monthKey(now);
    const dk = dayKey(now);
    for (const target of CDN_TARGETS) {
      const distributionId = opts.distributions[target];
      if (!distributionId) continue;
      const k = PENDING_PREFIX + target;
      const used = Number((await this.redis.get(mk)) ?? 0);
      const usedToday = Number((await this.redis.get(dk)) ?? 0);
      const monthRoom =
        opts.monthlyCap > 0
          ? Math.max(0, opts.monthlyCap - used)
          : Number.POSITIVE_INFINITY;
      const dayRoom =
        (opts.dailyCap ?? 0) > 0
          ? Math.max(0, (opts.dailyCap as number) - usedToday)
          : Number.POSITIVE_INFINITY;
      const take = Math.max(
        1,
        Math.min(MAX_WILDCARD_PATHS_PER_REQUEST, Math.floor(opts.batchMax)),
      );
      const popped = await this.redis.spop(k, take);
      if (!popped || popped.length === 0) continue;
      // Past the month's ceiling a path is dropped (its edge copy expires by
      // TTL); past the day's ceiling it only waits for tomorrow.
      const monthOk = popped.slice(0, Math.min(popped.length, monthRoom));
      out.dropped += popped.length - monthOk.length;
      const allowed = monthOk.slice(0, Math.min(monthOk.length, dayRoom));
      const deferred = monthOk.slice(allowed.length);
      if (deferred.length > 0) {
        await this.redis.sadd(k, ...deferred);
        await this.redis.expire(k, PENDING_TTL_SEC);
      }
      if (allowed.length === 0) continue;
      try {
        await send({ distributionId, paths: allowed });
        out.requests += 1;
        out.paths += allowed.length;
        await this.redis.incrby(mk, allowed.length);
        await this.redis.expire(mk, 62 * 24 * 3600);
        await this.redis.incrby(dk, allowed.length);
        await this.redis.expire(dk, 2 * 24 * 3600);
      } catch (err) {
        await this.redis.sadd(k, ...allowed);
        await this.redis.expire(k, PENDING_TTL_SEC);
        out.requeued += allowed.length;
        onError?.(err, target);
      }
    }
    return out;
  }
}

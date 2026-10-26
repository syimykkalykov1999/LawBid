import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** A precomputed admin aggregate with the time it was computed. */
export interface Summary<T> {
  data: T;
  /** ISO time of the computation (the panel shows «обновлено N мин назад»). */
  computedAt: string;
}

const PREFIX = 'adm:sum:';
/** Keeps the last good value for a day, so a stuck refresh still answers. */
const HARD_TTL_SECONDS = 24 * 3600;
/** One refresher per key at a time, across every API / worker process. */
const LOCK_SECONDS = 120;
/** A request that finds nothing waits this long for the process that is
 * already computing, then computes by itself. */
const WAIT_MS = 4000;
const WAIT_STEP_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Owner 2026-10-23 (admin economy pass): the admin's heavy aggregates —
 * dashboard totals, billing overview, trust and support stats — are
 * counted once for the whole team, not once per request. The worker's
 * `admin.summaries` cron refreshes them in the background; a request only
 * reads Redis. If the value is older than `freshSec` the stale value is
 * still returned at once and ONE process refreshes it
 * (stale-while-revalidate, like Stripe's and Shopify's dashboards); only
 * when nothing was ever computed does the first request wait for it, and
 * even then concurrent requests share one computation (a Redis lock + an
 * in-process promise), so a cold cache cannot become a stampede.
 */
@Injectable()
export class AdminSummaryService {
  private readonly inflight = new Map<string, Promise<Summary<unknown>>>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** The cached value, refreshed in the background when older than `freshSec`. */
  async get<T>(
    key: string,
    compute: () => Promise<T>,
    freshSec: number,
  ): Promise<Summary<T>> {
    const hit = await this.peek<T>(key);
    if (hit) {
      if (Date.now() - Date.parse(hit.computedAt) > freshSec * 1000) {
        void this.refresh(key, compute).catch(() => undefined);
      }
      return hit;
    }
    return this.refresh(key, compute, true);
  }

  /** What is stored now, or null. Never computes. */
  async peek<T>(key: string): Promise<Summary<T> | null> {
    let raw: string | null = null;
    try {
      raw = await this.redis.get(PREFIX + key);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Summary<T>;
    } catch {
      return null;
    }
  }

  /**
   * Compute and store (the cron calls this; so does a stale read). Shares one
   * computation per key in this process and one across processes via a Redis
   * lock. [waitForOther]: a caller with nothing to show waits for the lock
   * holder instead of computing a second time.
   */
  async refresh<T>(
    key: string,
    compute: () => Promise<T>,
    waitForOther = false,
  ): Promise<Summary<T>> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<Summary<T>>;
    const p = this.refreshOnce(key, compute, waitForOther).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, p);
    return p;
  }

  private async refreshOnce<T>(
    key: string,
    compute: () => Promise<T>,
    waitForOther: boolean,
  ): Promise<Summary<T>> {
    const lockKey = `${PREFIX}lock:${key}`;
    let locked = false;
    try {
      locked =
        (await this.redis.set(lockKey, '1', 'EX', LOCK_SECONDS, 'NX')) === 'OK';
    } catch {
      locked = true; // Redis trouble: compute here, the lock is only a courtesy.
    }
    if (!locked) {
      if (waitForOther) {
        for (let waited = 0; waited < WAIT_MS; waited += WAIT_STEP_MS) {
          await sleep(WAIT_STEP_MS);
          const hit = await this.peek<T>(key);
          if (hit) return hit;
        }
        // The holder is slow or died: fall through and compute.
      } else {
        const hit = await this.peek<T>(key);
        if (hit) return hit;
      }
    }
    try {
      const summary: Summary<T> = {
        data: await compute(),
        computedAt: new Date().toISOString(),
      };
      try {
        await this.redis.set(
          PREFIX + key,
          JSON.stringify(summary),
          'EX',
          HARD_TTL_SECONDS,
        );
      } catch {
        // Redis down: the answer is still right, it is just not shared.
      }
      return summary;
    } finally {
      if (locked) await this.redis.del(lockKey).catch(() => undefined);
    }
  }
}

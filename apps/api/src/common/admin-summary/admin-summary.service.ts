import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { delSafe } from '../../redis/redis-cluster-safe';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ADMIN_ACTIVE_KEY } from '../ops/admin-activity';

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

  /**
   * 2026-11-08 (owner: «админка тормозит даже без данных»): the read of an
   * admin BOARD (system health, «Масштаб», the cost registry, partitions,
   * cloud switches …). Plain stale-while-revalidate (RFC 5861, the way
   * Stripe's and Shopify's dashboards answer): ANY stored copy that passes
   * [valid] is returned at once — the page shows «обновлено N назад» from
   * the board's own time and polls again — and when it is older than
   * [freshMs] ONE refresh runs in the background (lock + in-process
   * promise). Only a board that was never built (or expired after a day)
   * makes the request wait, and concurrent waiters share that one build.
   * Before this, a copy older than 15 min was rebuilt INSIDE the request:
   * every first open after a pause waited for 20-40 queries and the AWS
   * probes queued on the API task's three database connections (prod
   * 2026-11-08: 1.2-2.4 s per request on an idle database).
   */
  async board<T>(
    key: string,
    compute: () => Promise<T>,
    freshMs: number,
    valid: (data: T) => boolean = (d) => d !== null && d !== undefined,
  ): Promise<T> {
    const hit = await this.peek<T>(key);
    if (hit && valid(hit.data)) {
      const age = Date.now() - Date.parse(hit.computedAt);
      if (!(age <= freshMs)) {
        void this.refresh(key, compute).catch(() => undefined);
      }
      return hit.data;
    }
    return (await this.refresh(key, compute, true)).data;
  }

  /** Forgets one stored copy (an action changed what the board shows). */
  async drop(key: string): Promise<void> {
    try {
      await this.redis.del(PREFIX + key);
    } catch {
      /* not shared, still right */
    }
  }

  /**
   * R-370 (owner 2026-11-04 «все страницы так открываются»): keeps [key]
   * warm from inside the API process — for boards the worker cannot build
   * (they read this process: the «API» light, the AWS/SSM clients of the
   * API task). Every [everyMs], while an admin request was seen in the last
   * 10 minutes (ADMIN_ACTIVE_KEY, the same signal the `admin.summaries`
   * cron follows in Авто), a copy older than [freshMs] is recomputed once
   * across all API tasks (the refresh lock). Nobody looking = no work.
   * Returns the stopper (onModuleDestroy).
   */
  keepWarm<T>(
    key: string,
    compute: () => Promise<T>,
    freshMs: number,
    everyMs = 60_000,
  ): () => void {
    const timer = setInterval(() => {
      void this.warmOnce(key, compute, freshMs).catch(() => undefined);
    }, everyMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  /** One keep-warm tick (exposed for tests): true when it recomputed. */
  async warmOnce<T>(
    key: string,
    compute: () => Promise<T>,
    freshMs: number,
  ): Promise<boolean> {
    if ((await this.redis.exists(ADMIN_ACTIVE_KEY)) !== 1) return false;
    const hit = await this.peek<T>(key);
    if (hit && Date.now() - Date.parse(hit.computedAt) < freshMs) return false;
    await this.refresh(key, compute);
    return true;
  }

  /** Stores a value computed elsewhere (an action that just rebuilt it). */
  async put<T>(key: string, data: T): Promise<void> {
    const summary: Summary<T> = { data, computedAt: new Date().toISOString() };
    try {
      await this.redis.set(
        PREFIX + key,
        JSON.stringify(summary),
        'EX',
        HARD_TTL_SECONDS,
      );
    } catch {
      /* not shared, still right */
    }
  }

  /**
   * R-403: {@link get} with one stored copy per [scope] of [family] (a null
   * scope is the family's own key). The scopes in use are remembered, so
   * {@link dropFamily} forgets them all without a key scan.
   */
  async getScoped<T>(
    family: string,
    scope: string | null,
    compute: () => Promise<T>,
    freshSec: number,
  ): Promise<Summary<T>> {
    if (!scope) return this.get(family, compute, freshSec);
    const scopes = `${PREFIX}${family}:scopes`;
    try {
      await this.redis.sadd(scopes, scope);
      await this.redis.expire(scopes, HARD_TTL_SECONDS);
    } catch {
      /* not shared, still right */
    }
    return this.get(`${family}:${scope}`, compute, freshSec);
  }

  /**
   * R-403: forgets every stored copy of [family], so the next read recomputes
   * at once (an admin action just changed what a badge counts; the next poll
   * must not see the 30 s copy).
   */
  async dropFamily(family: string): Promise<void> {
    try {
      const scopes = await this.redis.smembers(`${PREFIX}${family}:scopes`);
      await delSafe(this.redis, [
        PREFIX + family,
        ...scopes.map((s) => `${PREFIX}${family}:${s}`),
      ]);
    } catch {
      /* not shared, still right */
    }
  }

  /** What is stored now, or null. Never computes. */
  async peek<T>(key: string): Promise<Summary<T> | null> {
    let raw: string | null;
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
    let locked: boolean;
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

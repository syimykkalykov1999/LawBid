import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { jitterTtl, singleFlight } from '../../../common/cache/single-flight';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { failSoftRedis } from '../../../redis/fail-soft-redis';
import { throttledWarn } from '../../../common/logging/throttled-warn';
import { CircuitBreaker } from '../../../common/resilience/resilience';
import { bumpConfigVersion } from './config-version';

/** Same TTL reasoning as FeatureFlagsService — see that file's doc
 * comment. app_config changes even less often than feature_flags in
 * practice (a version bump is a release event, not a routine toggle),
 * but there is no reason to give it a different cache lifetime than the
 * flags it's served alongside in the same bootstrap payload. */
const APP_CONFIG_CACHE_TTL_SECONDS = 30;
export const APP_CONFIG_CACHE_KEY = 'config:app_config';

/** Owner 2026-10-18 (speed): the parsed map is also kept in this process
 * for a few seconds, so the many AppSettingsService reads in one request
 * do not each fetch and JSON.parse the whole config from Redis. Every
 * admin write path clears it (clearAppConfigMemo); a write on another
 * instance shows up within this TTL. Off under jest (NODE_ENV=test): the
 * specs reset the Redis key directly and expect an immediate re-read. */
const APP_CONFIG_MEMO_TTL_MS = 5_000;
let appConfigMemo: { at: number; value: Record<string, unknown> } | null = null;
/** Row 69: the one background refresh of a stale memo, and a counter that
 * makes a refresh started before clearAppConfigMemo() drop its result. */
let appConfigRefresh: Promise<void> | null = null;
let appConfigGeneration = 0;

export function clearAppConfigMemo(): void {
  appConfigMemo = null;
  appConfigGeneration += 1;
}

/** Admin write paths: drop the in-process memo and the Redis copy. */
export async function dropAppConfigCache(redis: Redis): Promise<void> {
  clearAppConfigMemo();
  await redis.del(APP_CONFIG_CACHE_KEY);
  await bumpConfigVersion(redis);
}

/**
 * Reads the full `app_config` table as a flat `{key: value}` map
 * (docs/02_DATABASE.md §4.B: "app_config: key text PK, value jsonb").
 * Every key `prisma/seed.ts`'s `seedAppConfig` writes is a plain JSON
 * string (a version like `"0.1.0"`), so callers that need the min/soft
 * update versions read `config['min_app_version_ios']` etc. as a string
 * — see BootstrapService and AppVersionGuard.
 */
@Injectable()
export class AppConfigService {
  /**
   * Load test 2026-11-02 (PR #606, LOAD_RESILIENCE §2): the Redis copy of
   * `app_config` is a cache of the table; while Redis is away it must be a
   * miss (the table is read, the in-process memo below bounds that) and the
   * write-back skipped — never an error. failSoftRedis is the project's
   * wrapper for exactly that (REDIS_CACHE_CLIENT is built from it); the
   * main client stays, so dropAppConfigCache's `del` hits the same keys.
   */
  private readonly cache: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) redis: Redis,
  ) {
    const warn = throttledWarn(new Logger(AppConfigService.name));
    this.cache = failSoftRedis(
      redis,
      (command, err) =>
        warn(
          { err, command, alert: 'app_config_redis_down' },
          'app_config cache: Redis unavailable, reading the table',
        ),
      new CircuitBreaker('redis_app_config', { threshold: 3, openMs: 10_000 }),
    );
  }

  /** [fresh]: skip (and leave untouched) the in-process memo — for a
   * caller that keeps what it builds (the bootstrap memo): writers drop the
   * Redis copy before they bump the config version, so this read is never
   * older than the version the caller keys its copy by. */
  async getConfig(fresh = false): Promise<Record<string, unknown>> {
    if (fresh) return this.loadConfig();
    const memoOn = process.env.NODE_ENV !== 'test';
    if (memoOn && appConfigMemo) {
      if (Date.now() - appConfigMemo.at < APP_CONFIG_MEMO_TTL_MS) {
        return appConfigMemo.value;
      }
      // Row 69 (KE 123): stale-while-revalidate (RFC 5861). Settings are
      // read inside many interactive transactions (case create, bid accept,
      // moderation ...). Awaiting the reload there meant, on a Redis miss, a
      // table read on a SECOND pool connection while the transaction held
      // its first; with the pool full of such transactions nobody could get
      // one until the 5 s timeout. The expired value (at most one refresh
      // older) is answered at once and one refresh runs in the background.
      if (!appConfigRefresh) {
        const generation = appConfigGeneration;
        appConfigRefresh = this.loadConfig()
          .then((value) => {
            if (generation === appConfigGeneration) {
              appConfigMemo = { at: Date.now(), value };
            }
          })
          .catch(() => undefined)
          .finally(() => {
            appConfigRefresh = null;
          });
      }
      return appConfigMemo.value;
    }
    const value = await this.loadConfig();
    if (memoOn) appConfigMemo = { at: Date.now(), value };
    return value;
  }

  private async loadConfig(): Promise<Record<string, unknown>> {
    const cached = await this.cache.get(APP_CONFIG_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached) as Record<string, unknown>;

    return singleFlight(APP_CONFIG_CACHE_KEY, async () => {
      const rows = await this.prisma.appConfig.findMany({
        select: { key: true, value: true },
      });
      const config: Record<string, unknown> = {};
      for (const row of rows) config[row.key] = row.value;

      await this.cache.set(
        APP_CONFIG_CACHE_KEY,
        JSON.stringify(config),
        'EX',
        jitterTtl(APP_CONFIG_CACHE_TTL_SECONDS),
      );
      return config;
    });
  }

  /** Convenience read for [AppVersionGuard]: the min app version for one
   * platform, as a string, or `undefined` if unset/not a string (e.g.
   * `app_config` hasn't been seeded yet in a given environment) — never
   * throws, since a guard that can't determine the minimum must not
   * block on that account (see AppVersionGuard's doc comment). */
  async getMinAppVersion(
    platform: 'ios' | 'android',
  ): Promise<string | undefined> {
    const config = await this.getConfig();
    const value = config[`min_app_version_${platform}`];
    return typeof value === 'string' ? value : undefined;
  }
}

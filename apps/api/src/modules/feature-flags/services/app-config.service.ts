import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { jitterTtl, singleFlight } from '../../../common/cache/single-flight';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { throttledWarn } from '../../../redis/fail-fast-redis';
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

export function clearAppConfigMemo(): void {
  appConfigMemo = null;
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
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getConfig(): Promise<Record<string, unknown>> {
    const memoOn = process.env.NODE_ENV !== 'test';
    if (
      memoOn &&
      appConfigMemo &&
      Date.now() - appConfigMemo.at < APP_CONFIG_MEMO_TTL_MS
    ) {
      return appConfigMemo.value;
    }
    const value = await this.loadConfig();
    if (memoOn) appConfigMemo = { at: Date.now(), value };
    return value;
  }

  /**
   * Load test 2026-11-02 (LOAD_RESILIENCE §2): the Redis copy is a cache of
   * the `app_config` table; while Redis is away it is a miss (the table is
   * read, the in-process memo above bounds that to one read per task per
   * APP_CONFIG_MEMO_TTL_MS) and the write-back is skipped — never an error.
   */
  private async loadConfig(): Promise<Record<string, unknown>> {
    let cached: string | null = null;
    try {
      cached = await this.redis.get(APP_CONFIG_CACHE_KEY);
    } catch (error) {
      this.warnRedis(error);
    }
    if (cached !== null) return JSON.parse(cached) as Record<string, unknown>;

    return singleFlight(APP_CONFIG_CACHE_KEY, async () => {
      const rows = await this.prisma.appConfig.findMany({
        select: { key: true, value: true },
      });
      const config: Record<string, unknown> = {};
      for (const row of rows) config[row.key] = row.value;

      try {
        await this.redis.set(
          APP_CONFIG_CACHE_KEY,
          JSON.stringify(config),
          'EX',
          jitterTtl(APP_CONFIG_CACHE_TTL_SECONDS),
        );
      } catch (error) {
        this.warnRedis(error);
      }
      return config;
    });
  }

  private readonly warnThrottled = throttledWarn(this.logger);
  private warnRedis(error: unknown): void {
    this.warnThrottled(
      { err: error, alert: 'app_config_redis_down' },
      'app_config cache: Redis unavailable, reading the table',
    );
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

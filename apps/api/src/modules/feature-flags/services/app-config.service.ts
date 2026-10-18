import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

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

  private async loadConfig(): Promise<Record<string, unknown>> {
    const cached = await this.redis.get(APP_CONFIG_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached) as Record<string, unknown>;

    const rows = await this.prisma.appConfig.findMany({
      select: { key: true, value: true },
    });
    const config: Record<string, unknown> = {};
    for (const row of rows) config[row.key] = row.value;

    await this.redis.set(
      APP_CONFIG_CACHE_KEY,
      JSON.stringify(config),
      'EX',
      APP_CONFIG_CACHE_TTL_SECONDS,
    );
    return config;
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

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { jitterTtl, singleFlight } from '../../../common/cache/single-flight';
import { L1Cache } from '../../../common/cache/l1-cache';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { FLAG_CATALOG } from '../flag-catalog';
import { lockFlags } from '../../../common/feature-flags/locked-flags';
import { bumpConfigVersion } from './config-version';

/** Same reasoning as I18nBundleService's bundle-version TTL
 * (i18n-bundle.service.ts): the admin's flag toggle writes straight to
 * `feature_flags` with no matching cache-bust here (there is no admin
 * module yet — file 6), so this TTL is what actually makes "смена флага в
 * БД отражается в приложении без релиза" (docs/01_FOUNDATION_AUTH.md §15
 * stage 1.8 acceptance) true in practice: an already-cached flag set is
 * stale for at most this long, then a bootstrap call reads through to
 * Postgres again. Short enough that a manually-toggled flag
 * shows up well within a minute; long enough that a burst of concurrent
 * `/config/bootstrap` calls (e.g. many clients cold-starting at once)
 * hits Redis, not the DB, for all but one of them. */
const FLAGS_CACHE_TTL_SECONDS = 30;
export const FLAGS_CACHE_KEY = 'config:feature_flags';

/**
 * Reads the full `feature_flags` table as a flat `{key: enabled}` map —
 * the shape `GET /config/bootstrap` returns (docs/01_FOUNDATION_AUTH.md
 * §15, "Этап 1.8": "флаги ... эндпоинт GET /config/bootstrap"). Redis
 * cache-aside, same pattern as I18nBundleService.getCurrentVersion.
 *
 * `rollout_percent` (schema.prisma `FeatureFlag`) is read from the DB but
 * deliberately not applied here: docs/01_FOUNDATION_AUTH.md never
 * describes per-user/per-cohort rollout for stage 1.8 (§15's acceptance
 * criterion is only "смена флага в БД отражается в приложении", a global
 * on/off), and `GET /config/bootstrap` is `@Public()` — there is no
 * authenticated user identity available at this endpoint to key a
 * percentage rollout on anyway. The column exists in the schema for a
 * later stage to use; this service just doesn't read it yet.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  /** Caching round 2 (S2-7): the flag map in memory for a few seconds, so a
   * flag read is not a Redis round trip on every request. `invalidate()`
   * clears it at once on this instance; another instance within the TTL
   * (`CACHE_L1_TTL_SEC`, default 5, 0 = off). */
  private readonly l1 = new L1Cache<Record<string, boolean>>('flags');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** A flag added to FLAG_CATALOG appears in the database on the next boot
   * with its starter value; a value an admin chose is never touched. The
   * test environment keeps its tables as the suites set them. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      // Owner 2026-10-22 (audit #4 §8): retired flags leave the database.
      const retired = FLAG_CATALOG.filter((f) => f.retired).map((f) => f.key);
      if (retired.length > 0) {
        await this.prisma.featureFlag.deleteMany({
          where: { key: { in: retired } },
        });
      }
      const made = await this.prisma.featureFlag.createMany({
        data: FLAG_CATALOG.filter((f) => !f.retired).map((f) => ({
          key: f.key,
          enabled: f.enabled,
          description: f.description,
          rollout_percent: 100,
        })),
        skipDuplicates: true,
      });
      if (made.count > 0) {
        await this.redis.del(FLAGS_CACHE_KEY);
        this.l1.clear();
        this.logger.log(
          `feature flags created from the catalog: ${made.count}`,
        );
      }
    } catch (e) {
      this.logger.warn(`feature flag catalog sync skipped: ${String(e)}`);
    }
  }

  async getFlags(): Promise<Record<string, boolean>> {
    return lockFlags(await this.readFlags());
  }

  private readFlags(): Promise<Record<string, boolean>> {
    return this.l1.getOrLoad('flags', () => this.readFlagsFromRedis());
  }

  private async readFlagsFromRedis(): Promise<Record<string, boolean>> {
    const cached = await this.redis.get(FLAGS_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached) as Record<string, boolean>;

    // Load audit 6: after an admin edit clears the key every request would
    // read the table; one refill per pod instead.
    return singleFlight(FLAGS_CACHE_KEY, async () => {
      const rows = await this.prisma.featureFlag.findMany({
        select: { key: true, enabled: true },
      });
      const flags: Record<string, boolean> = {};
      for (const row of rows) flags[row.key] = row.enabled;

      await this.redis.set(
        FLAGS_CACHE_KEY,
        JSON.stringify(flags),
        'EX',
        jitterTtl(FLAGS_CACHE_TTL_SECONDS),
      );
      return flags;
    });
  }

  /** One flag, for server-side enforcement (login methods, device
   * attestation). `defaultValue` applies when the row doesn't exist —
   * callers choose it per flag so a missing seed row fails in the
   * intended direction (login methods: open; attestation: off). */
  async isEnabled(key: string, defaultValue: boolean): Promise<boolean> {
    const flags = await this.getFlags();
    return flags[key] ?? defaultValue;
  }

  /** Drops the cached flag set so the next read goes to the DB — for a
   * writer that changes `feature_flags` (admin panel, file 6; e2e). */
  async invalidate(): Promise<void> {
    this.l1.clear();
    await this.redis.del(FLAGS_CACHE_KEY);
    await bumpConfigVersion(this.redis);
  }
}

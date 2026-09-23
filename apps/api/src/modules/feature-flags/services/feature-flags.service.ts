import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

/** Same reasoning as I18nBundleService's bundle-version TTL
 * (i18n-bundle.service.ts): the admin's flag toggle writes straight to
 * `feature_flags` with no matching cache-bust here (there is no admin
 * module yet — file 6), so this TTL is what actually makes "смена флага в
 * БД отражается в приложении без релиза" (docs/01_FOUNDATION_AUTH.md §15
 * stage 1.8 acceptance) true in practice: an already-cached flag set is
 * stale for at most this long, then a bootstrap call reads through to
 * Postgres/CockroachDB again. Short enough that a manually-toggled flag
 * shows up well within a minute; long enough that a burst of concurrent
 * `/config/bootstrap` calls (e.g. many clients cold-starting at once)
 * hits Redis, not the DB, for all but one of them. */
const FLAGS_CACHE_TTL_SECONDS = 30;
const FLAGS_CACHE_KEY = 'config:feature_flags';

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
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getFlags(): Promise<Record<string, boolean>> {
    const cached = await this.redis.get(FLAGS_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached) as Record<string, boolean>;

    const rows = await this.prisma.featureFlag.findMany({
      select: { key: true, enabled: true },
    });
    const flags: Record<string, boolean> = {};
    for (const row of rows) flags[row.key] = row.enabled;

    await this.redis.set(
      FLAGS_CACHE_KEY,
      JSON.stringify(flags),
      'EX',
      FLAGS_CACHE_TTL_SECONDS,
    );
    return flags;
  }
}

import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type Redis from 'ioredis';
import { AuditLogService } from '../../modules/admin-access/audit-log.service';
import { dropAppConfigCache } from '../../modules/feature-flags/services/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { AppSettingKey } from './app-settings.defaults';
import { ConfigRolloutService } from './config-rollout.service';

/**
 * A setting the automation itself moves (no admin, so no audit row: the
 * caller keeps its own action log), then the cache is dropped like an admin
 * save. Infra «Авто» moves `search.engine` this way (search-engine-auto).
 */
export async function writeSystemSetting(
  prisma: Pick<PrismaService, 'appConfig'>,
  redis: Redis | undefined,
  key: AppSettingKey,
  value: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  if (redis) await dropAppConfigCache(redis);
}

/** Object-valued settings a section saves as a whole (not typed tunables). */
export type RawSettingKey = 'rewards.departments' | 'uploads.limits';

/**
 * Owner 2026-10-05: sections with their own settings card (support desk,
 * rewards) save typed values here — one transaction with the audit row,
 * then the app_config cache is dropped so the change applies at once.
 * Callers validate the values (DTOs); unknown keys can't be written.
 */
@Injectable()
export class AppSettingsWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // Б3: optional only so narrow specs can build the writer without it.
    @Optional() private readonly rollout?: ConfigRolloutService,
  ) {}

  async write(
    adminId: string,
    action: string,
    values: Partial<
      Record<AppSettingKey | RawSettingKey, Prisma.InputJsonValue | undefined>
    >,
  ): Promise<void> {
    const entries = Object.entries(values).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findMany({
        where: { key: { in: entries.map(([k]) => k) } },
        select: { key: true, value: true },
      });
      for (const [key, value] of entries) {
        await tx.appConfig.upsert({
          where: { key },
          create: { key, value: value },
          update: { value: value },
        });
      }
      // Б3: the change goes to the canary tasks first (config-rollout.ts).
      const old = new Map(before.map((r) => [r.key, r.value]));
      await this.rollout?.stage(tx, {
        adminId,
        action,
        before: Object.fromEntries(
          entries.map(([k]) => [k, old.get(k) ?? null]),
        ),
        after: Object.fromEntries(
          entries.map(([k, v]) => [k, (v ?? null) as Prisma.JsonValue]),
        ),
      });
      await this.audit.record(
        {
          adminId,
          action,
          targetType: 'app_config',
          targetId: null,
          before: Object.fromEntries(before.map((r) => [r.key, r.value])),
          after: Object.fromEntries(entries),
        },
        tx,
      );
    });
    await dropAppConfigCache(this.redis);
  }

  /**
   * Deletes stored values so the built-in default applies again (cost
   * registry «Авто» of a provider cap). One transaction with the audit row.
   */
  async remove(adminId: string, action: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await withTxRetry(this.prisma, async (tx) => {
      const before = await tx.appConfig.findMany({
        where: { key: { in: keys } },
        select: { key: true, value: true },
      });
      await tx.appConfig.deleteMany({ where: { key: { in: keys } } });
      const old = new Map(before.map((r) => [r.key, r.value]));
      await this.rollout?.stage(tx, {
        adminId,
        action,
        before: Object.fromEntries(keys.map((k) => [k, old.get(k) ?? null])),
        after: Object.fromEntries(keys.map((k) => [k, null])),
      });
      await this.audit.record(
        {
          adminId,
          action,
          targetType: 'app_config',
          targetId: null,
          before: Object.fromEntries(before.map((r) => [r.key, r.value])),
          after: Object.fromEntries(keys.map((k) => [k, null])),
        },
        tx,
      );
    });
    await dropAppConfigCache(this.redis);
  }
}

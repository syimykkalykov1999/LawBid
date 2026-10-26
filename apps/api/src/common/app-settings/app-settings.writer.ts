import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { AuditLogService } from '../../modules/admin-access/audit-log.service';
import { dropAppConfigCache } from '../../modules/feature-flags/services/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { AppSettingKey } from './app-settings.defaults';

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

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AUTOSCALE_CONFIG_KEY,
  type WindowSetting,
} from '../../common/cost-guard/cost-autoscale.rules';
import {
  CostAutoscaleService,
  budgetConfigKey,
} from '../../common/cost-guard/cost-autoscale.service';
import {
  COST_PROVIDERS,
  COST_WINDOWS,
  type CostProvider,
  type CostWindow,
} from '../../common/cost-guard/cost-guard.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import { APP_CONFIG_CACHE_KEY } from '../feature-flags/services/app-config.service';
import type { BudgetLimitDto, UpdateBudgetLimitDto } from './admin-config.dto';
import { CONFIG_AUDIT } from './admin-config.service';

/**
 * Owner 2026-10-05 «Лимиты расходов» card (Система → Настройки): every
 * CostGuard cap with its mode (auto / manual), floor, safety ceiling and
 * today's / this month's usage. Admin edits are audited like any
 * app_config write (CONFIG_AUDIT.config); the automatic hourly changes
 * are made by CostAutoscaleService.
 */
@Injectable()
export class AdminBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly autoscale: CostAutoscaleService,
    private readonly audit: AuditLogService,
  ) {}

  async list(now: Date = new Date()): Promise<BudgetLimitDto[]> {
    const [{ settings, stored }, last] = await Promise.all([
      this.autoscale.readSettings(),
      this.autoscale.lastAutoAt(),
    ]);
    const out: BudgetLimitDto[] = [];
    for (const provider of COST_PROVIDERS) {
      const used = await this.autoscale.usage(provider, now);
      for (const window of COST_WINDOWS) {
        const s = settings[provider][window];
        out.push({
          provider,
          window,
          mode: s.mode,
          floor: s.floor,
          ceiling: s.ceiling,
          cap: this.autoscale.effectiveCap(stored, provider, window),
          envDefault: this.autoscale.envDefault(provider, window),
          usedToday: used.today,
          usedThisMonth: used.month,
          lastAutoAt: last[provider] ?? null,
        });
      }
    }
    return out;
  }

  async update(
    admin: AdminActor,
    provider: CostProvider,
    window: CostWindow,
    dto: UpdateBudgetLimitDto,
  ): Promise<BudgetLimitDto> {
    await this.redis.del(APP_CONFIG_CACHE_KEY);
    const { settings, stored } = await this.autoscale.readSettings();
    const current = settings[provider][window];
    const next: WindowSetting = {
      mode: dto.mode,
      floor: dto.floor ?? current.floor,
      ceiling: dto.ceiling ?? current.ceiling,
    };
    if (next.floor > next.ceiling) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The minimum cannot be above the ceiling.',
        details: { field: 'floor' },
      });
    }
    const capKey = budgetConfigKey(provider, window);
    const capBefore = this.autoscale.effectiveCap(stored, provider, window);
    const manualValue =
      dto.mode === 'manual' ? (dto.value ?? capBefore) : undefined;

    await withTxRetry(this.prisma, async (tx) => {
      const row = await tx.appConfig.findUnique({
        where: { key: AUTOSCALE_CONFIG_KEY },
      });
      const raw = isRecord(row?.value) ? { ...row.value } : {};
      const forProvider = isRecord(raw[provider]) ? { ...raw[provider] } : {};
      forProvider[window] = { ...next };
      raw[provider] = forProvider;
      const json = raw as Prisma.InputJsonValue;
      await tx.appConfig.upsert({
        where: { key: AUTOSCALE_CONFIG_KEY },
        create: { key: AUTOSCALE_CONFIG_KEY, value: json },
        update: { value: json },
      });
      await this.audit.record(
        {
          adminId: admin.id,
          action: CONFIG_AUDIT.config,
          targetType: 'app_config',
          targetId: null,
          before: {
            key: `${AUTOSCALE_CONFIG_KEY}.${provider}.${window}`,
            value: { ...current },
          },
          after: {
            key: `${AUTOSCALE_CONFIG_KEY}.${provider}.${window}`,
            value: { ...next },
          },
          ip: admin.ip,
        },
        tx,
      );
      if (manualValue !== undefined) {
        await tx.appConfig.upsert({
          where: { key: capKey },
          create: { key: capKey, value: manualValue },
          update: { value: manualValue },
        });
        await this.audit.record(
          {
            adminId: admin.id,
            action: CONFIG_AUDIT.config,
            targetType: 'app_config',
            targetId: null,
            before: { key: capKey, value: capBefore },
            after: { key: capKey, value: manualValue },
            ip: admin.ip,
          },
          tx,
        );
      }
    });
    await this.redis.del(APP_CONFIG_CACHE_KEY);
    if (dto.mode === 'auto') {
      await this.autoscale.recomputeProvider(provider);
    }
    const rows = await this.list();
    return rows.find((r) => r.provider === provider && r.window === window)!;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { FeatureFlagsService } from '../../modules/feature-flags/services/feature-flags.service';
import { dropAppConfigCache } from '../../modules/feature-flags/services/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  budgetConfigKey,
  CostAutoscaleService,
  storedCap,
} from '../cost-guard/cost-autoscale.service';
import {
  COST_PROVIDERS,
  COST_WINDOWS,
} from '../cost-guard/cost-guard.constants';
import {
  AwsCapacityService,
  type CapacityTarget,
} from '../ops/aws-capacity.service';
import { AwsOpsService, type TaskKind } from '../ops/aws-ops.service';
import type {
  CapacityReading,
  EconomyEvent,
  EconomyState,
} from '../ops/ops.constants';
import { OpsStateService } from '../ops/ops-state.service';
import {
  affordableCeilings,
  DB_TIERS,
  limitStepUp,
  manualCeiling,
  nextGuardActive,
  nextTier,
  pressures,
  projectMonth,
  REDIS_TIERS,
  allowedSpendUsd,
  type Pressure,
  type Tier,
} from './economy.rules';

export const ECONOMY_FLAG = 'economy_guard';

const DAY_MS = 86_400_000;
const PRESSURE_ALERT_TTL_SEC = 6 * 3600;

export interface EconomySettings {
  percent: number;
  thresholdUsd: number;
  ceilingMode: 'auto' | 'manual';
  manualApi: number;
  manualWorker: number;
  smsUnitUsd: number;
  videoUnitUsd: number;
  translateUnitUsd: number;
  awsFallbackUsd: number;
}

export interface SpendLine {
  key: 'aws' | 'sms' | 'video' | 'translate';
  monthToDateUsd: number;
  projectedUsd: number;
  /** actual = read from AWS Budgets; estimate = units × unit price. */
  source: 'actual' | 'estimate';
}

export interface EconomyFigures {
  revenue30dUsd: number;
  revenueMonthUsd: number;
  allowedUsd: number;
  lines: SpendLine[];
  monthToDateUsd: number;
  projectedUsd: number;
}

export interface ContainerReport {
  running: number | null;
  desired: number | null;
  ceiling: number | null;
  hardCap: number;
  taskUsd: number;
}

export interface TierRow {
  name: string;
  memoryGb: number;
  monthUsd: number;
  current: boolean;
}

export interface EconomyReport {
  enabled: boolean;
  guard: 'ok' | 'limited';
  since: string | null;
  figures: EconomyFigures;
  settings: EconomySettings;
  containers: {
    onAws: boolean;
    api: ContainerReport;
    worker: ContainerReport;
    scaleMode: 'min' | 'normal' | null;
  };
  capacity: {
    onAws: boolean;
    at: string | null;
    dbClass: string | null;
    dbNext: string | null;
    dbCpuPercent: number | null;
    dbConnections: number | null;
    dbMaxConnections: number | null;
    redisClass: string | null;
    redisNext: string | null;
    redisMemoryPercent: number | null;
    dbTiers: TierRow[];
    redisTiers: TierRow[];
  };
  events: EconomyEvent[];
}

const usd = (n: number) => Math.round(n * 100) / 100;

/**
 * Owner 2026-10-16 «чтобы мы не уходили в минус, платя только сторонним
 * системам». One place that knows the numbers (revenue from our own
 * payments, third-party spend estimates, the rule) and one `tick()` the
 * `economy.guard` cron runs every 5 minutes:
 *
 * - projected spend above the rule → «limited»: provider caps to their
 *   floors, new video uploads paused, SMS only for sign-in / reset,
 *   autoscaling at the minimum; back under 90 % → everything restored;
 * - otherwise the autoscaling ceiling follows what the rule can pay for
 *   (or the owner's manual number), within the Terraform cap;
 * - database / Redis under pressure → an event (and a log alert → e-mail);
 *   the admin raises the tier in one click.
 *
 * Everything sits behind the `economy_guard` flag: off = it lifts what it
 * set and stops acting.
 */
@Injectable()
export class EconomyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settingsSvc: AppSettingsService,
    private readonly flags: FeatureFlagsService,
    private readonly aws: AwsOpsService,
    private readonly capacity: AwsCapacityService,
    private readonly ops: OpsStateService,
    private readonly autoscale: CostAutoscaleService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EconomyService.name);
  }

  isEnabled(): Promise<boolean> {
    return this.flags.isEnabled(ECONOMY_FLAG, true);
  }

  async settings(): Promise<EconomySettings> {
    const s = this.settingsSvc;
    const [
      percent,
      thresholdUsd,
      mode,
      manualApi,
      manualWorker,
      smsUnitUsd,
      videoUnitUsd,
      translateUnitUsd,
      awsFallbackUsd,
    ] = await Promise.all([
      s.number('economy.max_spend_percent'),
      s.number('economy.min_threshold_usd'),
      s.string('economy.ceiling_mode'),
      s.number('economy.manual_api_max'),
      s.number('economy.manual_worker_max'),
      s.number('economy.sms_unit_usd'),
      s.number('economy.video_unit_usd'),
      s.number('economy.translate_unit_usd'),
      s.number('economy.aws_fallback_usd'),
    ]);
    return {
      percent,
      thresholdUsd,
      ceilingMode: mode === 'manual' ? 'manual' : 'auto',
      manualApi,
      manualWorker,
      smsUnitUsd,
      videoUnitUsd,
      translateUnitUsd,
      awsFallbackUsd,
    };
  }

  private async revenueUsd(since: Date): Promise<number> {
    const res = await this.prisma.payment.aggregate({
      _sum: { amount_cents: true },
      where: { status: 'succeeded', paid_at: { gte: since } },
    });
    return (res._sum.amount_cents ?? 0) / 100;
  }

  /** Revenue, estimated spend and the rule, as of [now]. */
  async figures(
    now: Date = new Date(),
    cfg?: EconomySettings,
  ): Promise<EconomyFigures> {
    const c = cfg ?? (await this.settings());
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [revenue30dUsd, revenueMonthUsd] = await Promise.all([
      this.revenueUsd(new Date(now.getTime() - 30 * DAY_MS)),
      this.revenueUsd(monthStart),
    ]);

    const lines: SpendLine[] = [];
    const cost =
      (await this.ops.cost()) ?? (await this.aws.cost(now).catch(() => null));
    if (cost) {
      lines.push({
        key: 'aws',
        monthToDateUsd: usd(cost.actualUsd),
        projectedUsd: usd(
          Math.max(
            cost.forecastUsd ?? projectMonth(cost.actualUsd, now),
            cost.actualUsd,
          ),
        ),
        source: 'actual',
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Owner 2026-10-18: a developer's Mac has no AWS bill at all — the
      // assumed «aws_fallback_usd» ($150) alone tripped the guard against
      // the $150 floor and paused new videos locally. In development only
      // the real metered spend (SMS, video, translation below) counts.
      // Production (and staging) keep the fallback estimate unchanged.
      lines.push({
        key: 'aws',
        monthToDateUsd: 0,
        projectedUsd: 0,
        source: 'estimate',
      });
    } else {
      const daysInMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
      ).getUTCDate();
      lines.push({
        key: 'aws',
        monthToDateUsd: usd(
          (c.awsFallbackUsd * now.getUTCDate()) / daysInMonth,
        ),
        projectedUsd: usd(c.awsFallbackUsd),
        source: 'estimate',
      });
    }
    const priced: [
      SpendLine['key'],
      (typeof COST_PROVIDERS)[number],
      number,
    ][] = [
      ['sms', 'sms', c.smsUnitUsd],
      ['video', 'video', c.videoUnitUsd],
      ['translate', 'translate', c.translateUnitUsd],
    ];
    for (const [key, provider, unit] of priced) {
      const { month } = await this.autoscale.usage(provider, now);
      const mtd = month * unit;
      lines.push({
        key,
        monthToDateUsd: usd(mtd),
        projectedUsd: usd(projectMonth(mtd, now)),
        source: 'estimate',
      });
    }
    return {
      revenue30dUsd: usd(revenue30dUsd),
      revenueMonthUsd: usd(revenueMonthUsd),
      allowedUsd: usd(
        allowedSpendUsd(revenue30dUsd, c.percent, c.thresholdUsd),
      ),
      lines,
      monthToDateUsd: usd(lines.reduce((s, l) => s + l.monthToDateUsd, 0)),
      projectedUsd: usd(lines.reduce((s, l) => s + l.projectedUsd, 0)),
    };
  }

  // --- the 5-minute job ---------------------------------------------------

  async tick(now: Date = new Date()): Promise<Record<string, unknown>> {
    const state = await this.ops.economy();
    const active = state?.guard === 'limited';
    if (!(await this.isEnabled())) {
      if (active) await this.release(now, 'выключено флагом economy_guard');
      return { skipped: 'flag economy_guard is off' };
    }
    const cfg = await this.settings();
    const f = await this.figures(now, cfg);
    const next = nextGuardActive(active, f.projectedUsd, f.allowedUsd);
    if (next && !active) await this.enter(f, now);
    else if (!next && active)
      await this.release(now, 'расходы вернулись в норму', f);
    else if (active && state) {
      await this.ops.setEconomy({
        ...state,
        projectedUsd: f.projectedUsd,
        allowedUsd: f.allowedUsd,
      });
    }
    const out: Record<string, unknown> = {
      limited: next,
      projectedUsd: f.projectedUsd,
      allowedUsd: f.allowedUsd,
    };
    out.ceilings = await this.applyCeilings(f, cfg, next, now).catch(
      (e: unknown) => this.fail('ceilings', e),
    );
    out.pressure = await this.checkPressure(now).catch((e: unknown) =>
      this.fail('pressure', e),
    );
    return out;
  }

  private fail(step: string, e: unknown): { error: string } {
    const err = e instanceof Error ? e.message : String(e);
    this.logger.warn({ err, step }, 'economy guard step failed');
    return { error: err };
  }

  private async event(kind: EconomyEvent['kind'], text: string, now: Date) {
    await this.ops.pushEconomyEvent({ at: now.toISOString(), kind, text });
  }

  private async enter(f: EconomyFigures, now: Date): Promise<void> {
    const savedCaps: EconomyState['savedCaps'] = {};
    const { settings, stored } = await this.autoscale.readSettings();
    for (const provider of COST_PROVIDERS) {
      for (const window of COST_WINDOWS) {
        const key = budgetConfigKey(provider, window);
        const effective = this.autoscale.effectiveCap(stored, provider, window);
        // 0 = the owner switched the provider off: never raise it.
        const floor = settings[provider][window].floor;
        const to = Math.min(effective, floor);
        if (to === effective) continue;
        savedCaps[key] = { before: storedCap(stored[key]) ?? null, set: to };
        await this.prisma.appConfig.upsert({
          where: { key },
          create: { key, value: to },
          update: { value: to },
        });
      }
    }
    await dropAppConfigCache(this.redis);
    await this.ops.setEconomy({
      guard: 'limited',
      since: now.toISOString(),
      projectedUsd: f.projectedUsd,
      allowedUsd: f.allowedUsd,
      savedCaps,
    });
    const text =
      `Расходы на сторонние сервисы за месяц ≈ $${f.projectedUsd} при допустимых $${f.allowedUsd}. ` +
      'Включены ограничения: лимиты сервисов на минимум, новые видео на паузе, SMS только для входа и сброса пароля, контейнеры на минимуме.';
    await this.event('guard_on', text, now);
    this.logger.warn(
      {
        alert: 'economy_guard_on',
        projectedUsd: f.projectedUsd,
        allowedUsd: f.allowedUsd,
      },
      text,
    );
  }

  private async release(
    now: Date,
    why: string,
    f?: EconomyFigures,
  ): Promise<void> {
    const state = await this.ops.economy();
    if (state?.guard === 'limited') {
      const { stored } = await this.autoscale.readSettings();
      for (const [key, saved] of Object.entries(state.savedCaps ?? {})) {
        // An admin who edited the cap meanwhile keeps their value.
        if (storedCap(stored[key]) !== saved.set) continue;
        if (saved.before === null) {
          await this.prisma.appConfig.deleteMany({ where: { key } });
        } else {
          await this.prisma.appConfig.upsert({
            where: { key },
            create: { key, value: saved.before },
            update: { value: saved.before },
          });
        }
      }
      await dropAppConfigCache(this.redis);
    }
    await this.ops.setEconomy({
      guard: 'ok',
      since: now.toISOString(),
      projectedUsd: f?.projectedUsd ?? state?.projectedUsd ?? 0,
      allowedUsd: f?.allowedUsd ?? state?.allowedUsd ?? 0,
      savedCaps: {},
    });
    const text = `Ограничения сняты (${why}): лимиты сервисов, видео, SMS и потолок контейнеров восстановлены.`;
    await this.event('guard_off', text, now);
    this.logger.info({ alert: 'economy_guard_off' }, text);
  }

  /** The autoscaling ceiling: minimum while limited, else the rule's. */
  private async applyCeilings(
    f: EconomyFigures,
    cfg: EconomySettings,
    limited: boolean,
    now: Date,
  ): Promise<Record<string, unknown> | null> {
    if (!this.aws.available) return null;
    const mode = await this.ops.scaleMode();
    if (limited) {
      if (!(mode?.mode === 'min' && mode.source === 'economy')) {
        await this.aws.setScale('min');
        await this.ops.setScaleMode({
          mode: 'min',
          by: 'auto',
          at: now.toISOString(),
          source: 'economy',
        });
      }
      return { mode: 'min' };
    }
    // An owner's or the AWS-budget cap stays until they lift it.
    if (mode?.mode === 'min' && mode.source !== 'economy') {
      return { skipped: 'scaling capped by owner or AWS budget' };
    }
    const min = this.aws.minTasks;
    const hard = {
      api: this.aws.hardCap('api'),
      worker: this.aws.hardCap('worker'),
    };
    let target: Record<TaskKind, number>;
    if (cfg.ceilingMode === 'manual') {
      target = {
        api: manualCeiling(cfg.manualApi, min, hard.api),
        worker: manualCeiling(cfg.manualWorker, min, hard.worker),
      };
    } else {
      const counts = await this.aws.taskCounts();
      if (!counts) return null;
      const want = affordableCeilings({
        headroomUsd: f.allowedUsd - f.projectedUsd,
        apiRunning: counts.api.running,
        workerRunning: counts.worker.running,
        apiTaskUsd: this.aws.taskUsd('api'),
        workerTaskUsd: this.aws.taskUsd('worker'),
        minTasks: min,
        apiHardCap: hard.api,
        workerHardCap: hard.worker,
      });
      const prev = await this.ops.ceiling();
      target = {
        api: limitStepUp(prev?.api ?? null, want.api),
        worker: limitStepUp(prev?.worker ?? null, want.worker),
      };
    }
    await this.aws.setCeilings(target);
    if (mode?.mode === 'min') {
      await this.ops.setScaleMode({
        mode: 'normal',
        by: 'auto',
        at: now.toISOString(),
        source: 'economy',
      });
    }
    const prev = await this.ops.ceiling();
    await this.ops.setCeiling({
      ...target,
      mode: cfg.ceilingMode,
      at: now.toISOString(),
    });
    if (!prev || prev.api !== target.api || prev.worker !== target.worker) {
      await this.event(
        'ceiling',
        `Потолок контейнеров: API ${prev?.api ?? '—'} → ${target.api}, фоновые ${prev?.worker ?? '—'} → ${target.worker} (${cfg.ceilingMode === 'auto' ? 'автомат' : 'вручную'}).`,
        now,
      );
    }
    return { ...target, mode: cfg.ceilingMode };
  }

  private pressureText(p: Pressure): string {
    const v = Math.round(p.value);
    switch (p.kind) {
      case 'db_cpu':
        return `База данных: процессор ${v}% (порог ${p.limit}%). Можно увеличить базу на ступень в карточке «Экономика».`;
      case 'db_connections':
        return `База данных: занято ${v}% соединений (порог ${p.limit}%). Можно увеличить базу на ступень в карточке «Экономика».`;
      case 'redis_memory':
        return `Redis: память ${v}% (порог ${p.limit}%). Можно увеличить Redis на ступень в карточке «Экономика».`;
    }
  }

  private async checkPressure(now: Date): Promise<unknown> {
    if (!this.capacity.available) return null;
    const [info, metrics] = await Promise.all([
      this.capacity.info(),
      this.capacity.metrics(now),
    ]);
    const reading: CapacityReading = {
      at: now.toISOString(),
      ...info,
      ...metrics,
    };
    await this.ops.setCapacity(reading);
    const hot = pressures(metrics);
    for (const p of hot) {
      if (!(await this.ops.firstTime(p.kind, PRESSURE_ALERT_TTL_SEC))) continue;
      const text = this.pressureText(p);
      await this.event(p.kind, text, now);
      this.logger.warn(
        {
          alert: 'capacity_pressure',
          kind: p.kind,
          value: p.value,
          limit: p.limit,
        },
        text,
      );
    }
    return { hot: hot.map((p) => p.kind) };
  }

  /** Admin button: database or Redis one tier up (caller checks step-up). */
  async increase(
    target: CapacityTarget,
    now: Date = new Date(),
  ): Promise<{ from: string; to: string } | null> {
    const res = await this.capacity.increase(target);
    if (!res) return null;
    const what = target === 'db' ? 'База данных' : 'Redis';
    const text = `${what}: ${res.from} → ${res.to} (по кнопке в админке; перезапуск на пару минут).`;
    await this.event('scaled_up', text, now);
    this.logger.warn(
      { alert: 'capacity_scaled_up', target, from: res.from, to: res.to },
      text,
    );
    return res;
  }

  // --- admin card ---------------------------------------------------------

  private tierRows(tiers: readonly Tier[], current: string | null): TierRow[] {
    return tiers.map((t) => ({ ...t, current: t.name === current }));
  }

  async report(now: Date = new Date()): Promise<EconomyReport> {
    const cfg = await this.settings();
    const [enabled, state, figures, events, cap, scaleMode, applied] =
      await Promise.all([
        this.isEnabled(),
        this.ops.economy(),
        this.figures(now, cfg),
        this.ops.economyEvents(20),
        this.ops.capacity(),
        this.ops.scaleMode(),
        this.ops.ceiling(),
      ]);
    const onAws = this.aws.available;
    const counts = onAws ? await this.aws.taskCounts().catch(() => null) : null;
    const now2 = onAws ? await this.aws.ceilingsNow().catch(() => null) : null;
    const container = (kind: TaskKind): ContainerReport => ({
      running: counts?.[kind].running ?? null,
      desired: counts?.[kind].desired ?? null,
      ceiling: now2?.[kind] ?? applied?.[kind] ?? null,
      hardCap: this.aws.hardCap(kind),
      taskUsd: this.aws.taskUsd(kind),
    });
    return {
      enabled,
      guard: state?.guard ?? 'ok',
      since: state?.since ?? null,
      figures,
      settings: cfg,
      containers: {
        onAws,
        api: container('api'),
        worker: container('worker'),
        scaleMode: scaleMode?.mode ?? null,
      },
      capacity: {
        onAws: this.capacity.available,
        at: cap?.at ?? null,
        dbClass: cap?.dbClass ?? null,
        dbNext: nextTier(DB_TIERS, cap?.dbClass)?.name ?? null,
        dbCpuPercent: cap?.dbCpuPercent ?? null,
        dbConnections: cap?.dbConnections ?? null,
        dbMaxConnections: cap?.dbMaxConnections ?? null,
        redisClass: cap?.redisClass ?? null,
        redisNext: nextTier(REDIS_TIERS, cap?.redisClass)?.name ?? null,
        redisMemoryPercent: cap?.redisMemoryPercent ?? null,
        dbTiers: this.tierRows(DB_TIERS, cap?.dbClass ?? null),
        redisTiers: this.tierRows(REDIS_TIERS, cap?.redisClass ?? null),
      },
      events,
    };
  }
}

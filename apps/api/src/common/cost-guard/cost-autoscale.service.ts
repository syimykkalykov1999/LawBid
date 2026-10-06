import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { withJobLock } from '../../jobs/handlers/job-lock';
import {
  APP_CONFIG_CACHE_KEY,
  AppConfigService,
} from '../../modules/feature-flags/services/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  AUTOSCALE_CONFIG_KEY,
  computeTargets,
  dayStamp,
  parseAutoscaleSettings,
  staleHistoryFields,
  summarizeUsage,
  type AutoscaleSettings,
  type WindowTarget,
} from './cost-autoscale.rules';
import {
  COST_PROVIDERS,
  COST_WINDOW_CONFIG,
  COST_WINDOWS,
  type CostProvider,
  type CostWindow,
} from './cost-guard.constants';
import { costCounterKey } from './cost-guard.service';

/** Daily history of one provider: hash `yyyymmdd` → units. */
export const historyKey = (p: CostProvider) => `budget:{${p}}:hist`;
/** Hash provider → ISO time of the last automatic recompute. */
export const AUTOSCALE_LAST_KEY = 'budget:autoscale:last';
const LOCK_NAME = 'cost.autoscale';
const LOCK_TTL_MS = 5 * 60_000;
const STARTUP_DELAY_MS = 20_000;
const DAY_MS = 86_400_000;

const PROVIDER_TEXT: Record<CostProvider, string> = {
  sms: 'SMS',
  email: 'e-mails',
  id_check: 'identity checks',
  storage: 'file uploads',
  translate: 'translations',
  video: 'video uploads',
};
const WINDOW_TEXT: Record<CostWindow, string> = {
  minute: 'per-minute',
  daily: 'daily',
  monthly: 'monthly',
};

export const budgetConfigKey = (p: CostProvider, w: CostWindow) =>
  `budget.${p}.${COST_WINDOW_CONFIG[w].configSuffix}`;

export interface AutoscaleChange {
  provider: CostProvider;
  window: CostWindow;
  from: number | null;
  to: number;
  target: number;
}

/**
 * Owner 2026-10-05: spend caps that follow real usage. Hourly
 * (`cost.autoscale` cron, plus once shortly after boot):
 * 1. copies today's and yesterday's CostGuard daily counters (they live
 *    only 2 days) into `budget:{p}:hist`, keeping 40 days;
 * 2. for every cap in mode «Авто» computes the new value
 *    (cost-autoscale.rules.ts) and writes it into the usual
 *    `budget.<p>.<suffix>` app_config row — CostGuardService keeps reading
 *    those rows and does not know about autoscale.
 * Writes only on change; a cap held down by its ceiling logs
 * `alert: cost_budget_ceiling` once per provider/window/day (CloudWatch
 * e-mail with a plain «что делать», infra/modules/monitoring). There is
 * no system admin to attribute an audit_log row to (admin_id is a FK to
 * users), so automatic changes are logged, not audited; the admin's own
 * edits in «Лимиты расходов» are audited by AdminBudgetsService.
 */
@Injectable()
export class CostAutoscaleService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private startup?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CostAutoscaleService.name);
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    // A fresh install gets values without waiting for the next hour.
    this.startup = setTimeout(() => {
      this.run().catch((err: unknown) =>
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'startup cost autoscale failed',
        ),
      );
    }, STARTUP_DELAY_MS);
    this.startup.unref();
  }

  onApplicationShutdown(): void {
    if (this.startup) clearTimeout(this.startup);
  }

  envDefault(provider: CostProvider, window: CostWindow): number {
    return this.config.getOrThrow<number>(
      `BUDGET_${provider.toUpperCase()}_${COST_WINDOW_CONFIG[window].envSuffix}`,
    );
  }

  /** Settings + the raw app_config map they were read from. */
  async readSettings(): Promise<{
    settings: AutoscaleSettings;
    stored: Record<string, unknown>;
  }> {
    const stored = await this.appConfig.getConfig();
    const settings = parseAutoscaleSettings(
      stored[AUTOSCALE_CONFIG_KEY],
      (p, w) => this.envDefault(p, w),
      (p, w) => storedCap(stored[budgetConfigKey(p, w)]),
    );
    return { settings, stored };
  }

  /** The cap CostGuardService applies now (stored row, else env). */
  effectiveCap(
    stored: Record<string, unknown>,
    provider: CostProvider,
    window: CostWindow,
  ): number {
    return (
      storedCap(stored[budgetConfigKey(provider, window)]) ??
      this.envDefault(provider, window)
    );
  }

  /** Live CostGuard counters: today and this month. */
  async usage(
    provider: CostProvider,
    now: Date = new Date(),
  ): Promise<{ today: number; month: number }> {
    const [d, m] = await this.redis.mget(
      costCounterKey(provider, 'daily', now),
      costCounterKey(provider, 'monthly', now),
    );
    return { today: toCount(d), month: toCount(m) };
  }

  async lastAutoAt(): Promise<Partial<Record<CostProvider, string>>> {
    const raw = await this.redis.hgetall(AUTOSCALE_LAST_KEY);
    return raw;
  }

  /** Hourly job (one instance at a time across the fleet). */
  async run(now: Date = new Date()): Promise<{
    changes: AutoscaleChange[];
  } | null> {
    return withJobLock(this.redis, LOCK_NAME, LOCK_TTL_MS, async () => {
      const changes: AutoscaleChange[] = [];
      for (const provider of COST_PROVIDERS) {
        await this.snapshotHistory(provider, now);
      }
      const { settings, stored } = await this.readSettings();
      for (const provider of COST_PROVIDERS) {
        changes.push(
          ...(await this.applyProvider(provider, settings, stored, now)),
        );
      }
      if (changes.length > 0) await this.redis.del(APP_CONFIG_CACHE_KEY);
      return { changes };
    });
  }

  /** After an admin edit: snapshot + recompute one provider right away. */
  async recomputeProvider(
    provider: CostProvider,
    now: Date = new Date(),
  ): Promise<AutoscaleChange[]> {
    await this.redis.del(APP_CONFIG_CACHE_KEY);
    await this.snapshotHistory(provider, now);
    const { settings, stored } = await this.readSettings();
    const changes = await this.applyProvider(provider, settings, stored, now);
    if (changes.length > 0) await this.redis.del(APP_CONFIG_CACHE_KEY);
    return changes;
  }

  /** Copies today's and yesterday's daily counters into the history. */
  async snapshotHistory(provider: CostProvider, now: Date): Promise<void> {
    const yesterday = new Date(now.getTime() - DAY_MS);
    const [today, prev] = await this.redis.mget(
      costCounterKey(provider, 'daily', now),
      costCounterKey(provider, 'daily', yesterday),
    );
    const key = historyKey(provider);
    const fields: Record<string, string> = {};
    if (today !== null) fields[dayStamp(now)] = String(toCount(today));
    if (prev !== null) fields[dayStamp(yesterday)] = String(toCount(prev));
    if (Object.keys(fields).length > 0) await this.redis.hset(key, fields);
    const stale = staleHistoryFields(await this.redis.hkeys(key), now);
    if (stale.length > 0) await this.redis.hdel(key, ...stale);
  }

  private async applyProvider(
    provider: CostProvider,
    settings: AutoscaleSettings,
    stored: Record<string, unknown>,
    now: Date,
  ): Promise<AutoscaleChange[]> {
    const ps = settings[provider];
    const autoWindows = COST_WINDOWS.filter((w) => ps[w].mode === 'auto');
    if (autoWindows.length === 0) return [];

    const rawHist = await this.redis.hgetall(historyKey(provider));
    const history: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawHist)) history[k] = toCount(v);
    const monthCounter = toCount(
      await this.redis.get(costCounterKey(provider, 'monthly', now)),
    );
    const targets = computeTargets(
      summarizeUsage(history, now, monthCounter),
      ps,
    );

    const changes: AutoscaleChange[] = [];
    for (const window of autoWindows) {
      const t = targets[window];
      if (t.clampedBy === 'ceiling') {
        await this.alertCeiling(provider, window, t, now);
      }
      const key = budgetConfigKey(provider, window);
      const before = storedCap(stored[key]) ?? null;
      if (before === t.value) continue;
      await this.prisma.appConfig.upsert({
        where: { key },
        create: { key, value: t.value },
        update: { value: t.value },
      });
      changes.push({
        provider,
        window,
        from: before,
        to: t.value,
        target: t.target,
      });
      this.logger.info(
        {
          event: 'cost_budget_autoscaled',
          provider,
          window,
          from: before,
          to: t.value,
          target: t.target,
          clampedBy: t.clampedBy,
        },
        'spend cap adjusted to real usage',
      );
    }
    await this.redis.hset(AUTOSCALE_LAST_KEY, provider, now.toISOString());
    return changes;
  }

  private async alertCeiling(
    provider: CostProvider,
    window: CostWindow,
    t: WindowTarget,
    now: Date,
  ): Promise<void> {
    const flag = `budget:{${provider}}:ceil:${window}:${dayStamp(now)}`;
    const first = await this.redis.set(flag, '1', 'EX', 2 * 86_400, 'NX');
    if (first !== 'OK') return;
    this.logger.warn(
      {
        alert: 'cost_budget_ceiling',
        provider,
        window,
        wanted: t.target,
        cap: t.value,
      },
      `Usage of ${PROVIDER_TEXT[provider]} keeps growing: the automatic ${WINDOW_TEXT[window]} limit wants ${t.target} but stops at the safety ceiling ${t.value}. ` +
        'If this growth is real (more users), raise «Потолок» in Админка → Система → Настройки → Лимиты расходов; if not, it may be abuse — the limit is protecting you.',
    );
  }
}

function toCount(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Same acceptance rule as CostGuardService.parseCap. */
export function storedCap(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

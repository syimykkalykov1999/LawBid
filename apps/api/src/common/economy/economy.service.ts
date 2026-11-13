import { Inject, Injectable, Optional } from '@nestjs/common';
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
  ECONOMY_DAILY_BRAKE_KEY,
  ECONOMY_DAILY_BRAKE_TTL_SEC,
  type CostProvider,
} from '../cost-guard/cost-guard.constants';
import { parsePriceBook, unitUsdPerCall } from '../cost-guard/cost-prices';
import { S3StorageService } from '../../modules/files/storage/s3-storage.service';
import { AdminSummaryService } from '../admin-summary/admin-summary.service';
import { withTimeout } from '../resilience/resilience';
import { SpendService, type VendorSpend } from '../ops/spend/spend.service';
import {
  AwsCapacityService,
  type CapacityTarget,
} from '../ops/aws-capacity.service';
import {
  AwsOpsService,
  type OtherKind,
  type TaskKind,
} from '../ops/aws-ops.service';
import type {
  CapacityReading,
  EconomyEvent,
  EconomyState,
} from '../ops/ops.constants';
import { OpsStateService } from '../ops/ops-state.service';
import { SsmParamGateway } from '../ops/ssm-param.gateway';
import {
  affordableCeilings,
  dailyBrakeCents,
  dbStorageMonthUsd,
  DB_TIERS,
  netRevenueUsd,
  pickVendorLine,
  limitStepUp,
  manualCeiling,
  nextGuardActive,
  nextTier,
  prevTier,
  pressures,
  shrinkBlocker,
  projectMonth,
  REDIS_TIERS,
  allowedSpendUsd,
  affordableTier,
  DB_CEILING_SHARE,
  REDIS_CEILING_SHARE,
  type Pressure,
  type Tier,
} from './economy.rules';

export const ECONOMY_FLAG = 'economy_guard';
const SCALE_CONTROLS_KEY = 'economy:scale_controls_published';

const DAY_MS = 86_400_000;
const PRESSURE_ALERT_TTL_SEC = 6 * 3600;
/** Owner 2026-11-04 (R-369): «Масштаб» stood on an empty skeleton because
 * every open of `GET /admin/economy` asked AWS (ECS, Auto Scaling, Budgets)
 * and the spend snapshot one after another, with no time limit. The report
 * is now a shared admin summary (AdminSummaryService, the same pattern as
 * «Здоровье системы»): younger than FRESH it is served as is; an older
 * copy is served at once while ONE refresh runs in the background (2026-11-08:
 * any age, AdminSummaryService.board); only a never-built report waits. Every outside call has its own time limit and
 * falls back to «н/д» (null) instead of holding the whole answer. */
const REPORT_KEY = 'economy:report';
const REPORT_FRESH_MS = 60_000;
const OUTSIDE_CALL_MS = 3_000;

/** [p] or null after [ms] / on failure: one slow source never blocks the card. */
function orNull<T>(
  name: string,
  p: () => Promise<T>,
  ms = OUTSIDE_CALL_MS,
): Promise<T | null> {
  return withTimeout(name, ms, p).catch(() => null);
}

export interface EconomySettings {
  percent: number;
  thresholdUsd: number;
  ceilingMode: 'auto' | 'manual';
  manualApi: number;
  manualWorker: number;
  awsFallbackUsd: number;
  /** Owner 2026-11-09: the AWS money ceiling the owner typed, $ a month.
   * 0 (default) = none: containers, the database and Redis grow by load up
   * to their Terraform maximum; above 0 they grow only as far as this sum
   * pays, and the AWS brake holds them at the minimum over it. */
  awsCapUsd: number;
  /** S9-4: the daily money brake = allowed / 30 × this many days. */
  dailyBrakeDays: number;
  /** Owner 2026-11-12 (row 67): the owner's ceiling of every ECS service
   * (`scale.max_tasks.*`, default 100, no upper bound). */
  maxTasks: Record<TaskKind | OtherKind, number>;
}

/** Owner 2026-11-12 (row 67): the services with an owner's ceiling. */
export const MAX_TASK_KINDS = [
  'api',
  'worker',
  'api_admin',
  'admin',
  'pgbouncer',
] as const;
export const DEFAULT_MAX_TASKS = 100;

/** A typed number, or the default 100 when it is missing or not >= 1. */
export function ownerMaxTasks(v: unknown): number {
  const n = typeof v === 'number' ? Math.floor(v) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_TASKS;
}

/** `scale.max_tasks.*` of every service (an unreadable one = 100). */
export async function readMaxTasks(s: {
  number(key: string): Promise<number>;
}): Promise<EconomySettings['maxTasks']> {
  const vals = await Promise.all(
    MAX_TASK_KINDS.map((k) =>
      s.number(`scale.max_tasks.${k}`).catch(() => DEFAULT_MAX_TASKS),
    ),
  );
  return Object.fromEntries(
    MAX_TASK_KINDS.map((k, i) => [k, ownerMaxTasks(vals[i])]),
  ) as EconomySettings['maxTasks'];
}

export interface SpendLine {
  key:
    | 'aws'
    | 'sms'
    | 'video'
    | 'translate'
    | 'id_check'
    | 'email'
    | 'image_moderation'
    | 'cloudflare';
  monthToDateUsd: number;
  projectedUsd: number;
  /** actual = read from the vendor (AWS Budgets, Twilio, Bunny…);
   * estimate = calls × the price book. */
  source: 'actual' | 'estimate';
  /** The AWS bill already contains this line (SES, Rekognition): shown,
   * but not added to the totals a second time. */
  coveredBy?: 'aws' | null;
}

export interface EconomyFigures {
  revenue30dUsd: number;
  revenueMonthUsd: number;
  /** What the rule allows for THIRD-PARTY services this month. */
  allowedUsd: number;
  lines: SpendLine[];
  /** Both brakes together (third-party + AWS). */
  monthToDateUsd: number;
  projectedUsd: number;
  /** Owner 2026-11-08: two brakes, each braking only what it controls.
   * Third-party: metered external services (SMS, Bunny video, translation,
   * ID checks, Cloudflare) against [allowedUsd]. */
  thirdPartyMonthToDateUsd: number;
  thirdPartyProjectedUsd: number;
  /** AWS: the AWS bill (SES and Rekognition included) against the AWS
   * budget (AWS Budgets, `OPS_BUDGET_NAME`); caps only AWS resources. */
  awsMonthToDateUsd: number;
  awsProjectedUsd: number;
  /** The AWS budget; when Budgets cannot be read, [allowedUsd]. */
  awsLimitUsd: number;
}

/** Spend lines that are AWS products (on the AWS bill); the rest is the
 * third-party brake's. */
export const AWS_SPEND_KEYS: ReadonlySet<SpendLine['key']> = new Set([
  'aws',
  'email',
  'image_moderation',
]);

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
    /** S9-14: allocated disk, GB, and its monthly price (gp3). */
    dbStorageGb: number | null;
    dbStorageUsd: number | null;
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
 * - owner 2026-11-08, two brakes, each braking only what it controls:
 *   third-party spend (SMS, Bunny video, translation, ID checks, Cloudflare)
 *   above the rule → «limited»: those providers' caps to their floors, new
 *   video uploads paused, SMS only for sign-in / reset; back under 90 % →
 *   restored. The AWS bill against the AWS budget → container ceiling and
 *   DB / Redis growth only (minimum while over, the budget's headroom
 *   otherwise, or the owner's manual number), within the Terraform cap;
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
    @Optional() private readonly spend?: SpendService,
    @Optional() private readonly storage?: S3StorageService,
    // Cost registry V4: writes the money ceiling of the autoscalers (SSM).
    @Optional() private readonly ssm?: SsmParamGateway,
    // R-369: the shared, background-refreshed copy of report().
    @Optional() private readonly summary?: AdminSummaryService,
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
      awsFallbackUsd,
      dailyBrakeDays,
      awsCapUsd,
      maxTasks,
    ] = await Promise.all([
      s.number('economy.max_spend_percent'),
      s.number('economy.min_threshold_usd'),
      s.string('economy.ceiling_mode'),
      s.number('economy.manual_api_max'),
      s.number('economy.manual_worker_max'),
      s.number('economy.aws_fallback_usd'),
      s.number('economy.daily_brake_days'),
      s.number('economy.aws_cap_usd'),
      readMaxTasks(s),
    ]);
    return {
      percent,
      thresholdUsd,
      ceilingMode: mode === 'manual' ? 'manual' : 'auto',
      manualApi,
      manualWorker,
      awsFallbackUsd,
      dailyBrakeDays,
      awsCapUsd: Number.isFinite(awsCapUsd) && awsCapUsd > 0 ? awsCapUsd : 0,
      maxTasks,
    };
  }

  /** Owner 2026-11-12 (row 67): `scale.max_tasks.*` (default 100). */
  private maxTasks(): Promise<EconomySettings['maxTasks']> {
    return readMaxTasks(this.settingsSvc);
  }

  /** Owner 2026-11-12 (row 67): api-admin, admin and the pooler always get
   * the owner's ceiling (no money rule for them; growth is by CPU need). */
  private async applyOtherCeilings(
    max: EconomySettings['maxTasks'],
  ): Promise<Record<string, unknown> | null> {
    if (!this.aws.available) return null;
    return this.aws.setOtherCeilings({
      api_admin: max.api_admin,
      admin: max.admin,
      pgbouncer: max.pgbouncer,
    });
  }

  /** S9-3: NET revenue since [since] — price before tax of succeeded
   * payments, minus refunds of those payments, minus the estimated Stripe
   * fee (the cash the company keeps, not what customers were charged). */
  private async revenueUsd(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      {
        subtotal_cents: bigint | number | null;
        gross_cents: bigint | number | null;
        payments: bigint | number | null;
        refunded_cents: bigint | number | null;
      }[]
    >`
      SELECT
        COALESCE(SUM(COALESCE(p.subtotal_cents, p.amount_cents - COALESCE(p.tax_cents, 0))), 0) AS subtotal_cents,
        COALESCE(SUM(p.amount_cents), 0) AS gross_cents,
        COUNT(*) AS payments,
        COALESCE(SUM((SELECT COALESCE(SUM(r.amount_cents), 0) FROM refunds r
                      WHERE r.payment_id = p.id AND r.status = 'succeeded')), 0) AS refunded_cents
      FROM payments p
      WHERE p.status = 'succeeded' AND p.paid_at >= ${since}`;
    const r = rows[0];
    return netRevenueUsd({
      subtotalCents: Number(r?.subtotal_cents ?? 0),
      grossCents: Number(r?.gross_cents ?? 0),
      payments: Number(r?.payments ?? 0),
      refundedCents: Number(r?.refunded_cents ?? 0),
    });
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
      (await this.ops.cost()) ??
      (await orNull('aws.cost', () => this.aws.cost(now)));
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
    const awsActual = lines[0].source === 'actual';
    const [vendors, { stored }] = await Promise.all([
      this.vendorReadings(now),
      this.autoscale.readSettings(),
    ]);
    const book = parsePriceBook(stored);
    const counted = async (p: CostProvider): Promise<number> =>
      (await this.autoscale.usage(p, now)).month * unitUsdPerCall(p, book);
    // [key, provider, vendor reading, covered by the AWS bill]
    const priced: [
      SpendLine['key'],
      CostProvider,
      VendorSpend | undefined,
      boolean,
    ][] = [
      ['sms', 'sms', vendors.get('twilio'), false],
      ['video', 'video', vendors.get('bunny'), false],
      ['translate', 'translate', vendors.get('google'), false],
      ['id_check', 'id_check', undefined, false],
      ['email', 'email', undefined, awsActual],
      ['image_moderation', 'image_moderation', undefined, awsActual],
    ];
    // The counters are independent Redis reads: ask them together.
    const usage = await Promise.all(priced.map(([, p]) => counted(p)));
    for (const [i, [key, , vendor, covered]] of priced.entries()) {
      const pick = pickVendorLine(vendor, usage[i], now);
      lines.push({
        key,
        monthToDateUsd: usd(pick.monthToDateUsd),
        projectedUsd: usd(pick.projectedUsd),
        source: pick.source,
        ...(covered ? { coveredBy: 'aws' as const } : {}),
      });
    }
    // Cloudflare (calls over the free traffic, R2): only the vendor's
    // number, there is no counter behind it.
    const cf = vendors.get('cloudflare');
    if (cf && cf.status !== 'nodata' && cf.monthToDateUsd !== null) {
      const pick = pickVendorLine(cf, 0, now);
      lines.push({
        key: 'cloudflare',
        monthToDateUsd: usd(pick.monthToDateUsd),
        projectedUsd: usd(pick.projectedUsd),
        source: 'actual',
      });
    }
    const counts = lines.filter((l) => !l.coveredBy);
    const sum = (ls: SpendLine[], k: 'monthToDateUsd' | 'projectedUsd') =>
      usd(ls.reduce((s, l) => s + l[k], 0));
    const awsLines = counts.filter((l) => AWS_SPEND_KEYS.has(l.key));
    const vendorLines = counts.filter((l) => !AWS_SPEND_KEYS.has(l.key));
    const allowedUsd = usd(
      allowedSpendUsd(revenue30dUsd, c.percent, c.thresholdUsd),
    );
    return {
      revenue30dUsd: usd(revenue30dUsd),
      revenueMonthUsd: usd(revenueMonthUsd),
      allowedUsd,
      lines,
      monthToDateUsd: sum(counts, 'monthToDateUsd'),
      projectedUsd: sum(counts, 'projectedUsd'),
      thirdPartyMonthToDateUsd: sum(vendorLines, 'monthToDateUsd'),
      thirdPartyProjectedUsd: sum(vendorLines, 'projectedUsd'),
      awsMonthToDateUsd: sum(awsLines, 'monthToDateUsd'),
      awsProjectedUsd: sum(awsLines, 'projectedUsd'),
      awsLimitUsd: cost && cost.limitUsd > 0 ? usd(cost.limitUsd) : allowedUsd,
    };
  }

  /** The vendors' own numbers from the spend snapshot (S9-1); empty when
   * the snapshot cannot be read (the counters take over). */
  private async vendorReadings(
    now: Date,
  ): Promise<Map<VendorSpend['id'], VendorSpend>> {
    const rep = this.spend
      ? await orNull('spend.report', () => this.spend!.report(now))
      : null;
    return new Map((rep?.vendors ?? []).map((v) => [v.id, v]));
  }

  // --- the 5-minute job ---------------------------------------------------

  async tick(now: Date = new Date()): Promise<Record<string, unknown>> {
    const state = await this.ops.economy();
    const active = state?.guard === 'limited';
    if (!(await this.isEnabled())) {
      if (active) await this.release(now, 'выключено флагом economy_guard');
      // Owner 2026-11-09: «Автоматика выключена — ничего не ограничивается»
      // must be true in AWS too: before, a switched-off tick returned here
      // and the small ceilings written while it was on stayed for good.
      const lifted = await this.liftCeilings(now).catch((e: unknown) =>
        this.fail('lift_ceilings', e),
      );
      const others = await this.maxTasks()
        .then((m) => this.applyOtherCeilings(m))
        .catch((e: unknown) => this.fail('other_ceilings', e));
      // Owner 2026-11-10: «Масштаб» showed «—» for the database and Redis
      // size: the reading was taken only with the guard on. Watching is not
      // limiting, so the size, CPU and memory are read (and their alerts
      // sent) either way.
      const pressure = await this.checkPressure(now).catch((e: unknown) =>
        this.fail('pressure', e),
      );
      // 13.11 (KNOWN_ERRORS 135): the owner's three-state controls (Spot
      // fallback, endpoints) are commands, not limits — they must reach the
      // Lambdas with the guard off too. Before, a switched-off tick returned
      // here and «держать на обычных серверах» never arrived (S3 object
      // stale since 12:50 while economy_guard was off since 09.11).
      await this.publishScaleControls();
      return {
        skipped: 'flag economy_guard is off',
        lifted,
        others,
        pressure,
      };
    }
    const cfg = await this.settings();
    const f = await this.figures(now, cfg);
    await this.writeDailyBrake(f.allowedUsd, cfg.dailyBrakeDays);
    await this.publishScaleControls();
    // Owner 2026-11-08: the third-party brake counts only metered external
    // services and limits only them; the AWS bill has its own brake below.
    const next = nextGuardActive(
      active,
      f.thirdPartyProjectedUsd,
      f.allowedUsd,
    );
    if (next && !active) await this.enter(f, now);
    else if (!next && active)
      await this.release(now, 'расходы вернулись в норму', f);
    else if (active && state) {
      await this.ops.setEconomy({
        ...state,
        projectedUsd: f.thirdPartyProjectedUsd,
        allowedUsd: f.allowedUsd,
      });
    }
    const out: Record<string, unknown> = {
      limited: next,
      projectedUsd: f.thirdPartyProjectedUsd,
      allowedUsd: f.allowedUsd,
      awsProjectedUsd: f.awsProjectedUsd,
      awsLimitUsd: f.awsLimitUsd,
    };
    out.ceilings = await this.applyCeilings(f, cfg, now).catch((e: unknown) =>
      this.fail('ceilings', e),
    );
    out.otherCeilings = await this.applyOtherCeilings(cfg.maxTasks).catch(
      (e: unknown) => this.fail('other_ceilings', e),
    );
    out.pressure = await this.checkPressure(now).catch((e: unknown) =>
      this.fail('pressure', e),
    );
    out.capacityCeiling = await this.applyCapacityCeilings(cfg).catch(
      (e: unknown) => this.fail('capacity_ceiling', e),
    );
    return out;
  }

  /**
   * Cost registry V4: the database / Redis autoscalers may not grow past what
   * the allowed monthly spend pays for. Writes the biggest affordable size
   * into each autoscaler's SSM `max-class` parameter (a ceiling the Lambda can
   * only apply BELOW its Terraform maximum). `scale.capacity_ceiling.mode`
   * off = hands off (the Terraform ceiling alone stays).
   */
  private async applyCapacityCeilings(
    cfg: Pick<EconomySettings, 'awsCapUsd'>,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ssm?.available) return null;
    const mode = await this.settingsSvc.string('scale.capacity_ceiling.mode');
    // Owner 2026-11-09: no money ceiling unless he typed a sum (and the
    // switch is not off): the largest size, so the Lambda's own Terraform
    // maximum is the only cap. Writing it (not «hands off») also lifts a
    // small ceiling an earlier tick left in SSM.
    const capped = mode !== 'off' && cfg.awsCapUsd > 0;
    const out: Record<string, unknown> = {};
    const plan: [CapacityTarget, readonly Tier[], number][] = [
      ['db', DB_TIERS, DB_CEILING_SHARE],
      ['redis', REDIS_TIERS, REDIS_CEILING_SHARE],
    ];
    for (const [target, tiers, share] of plan) {
      const param = this.ssm.maxClassParam(target);
      if (!param) continue;
      const want = capped
        ? affordableTier(tiers, cfg.awsCapUsd, share)
        : tiers[tiers.length - 1];
      const have = await this.ssm.get(param);
      if (have === want.name) {
        out[target] = { ceiling: want.name, changed: false };
        continue;
      }
      await this.ssm.put(param, want.name);
      this.logger.info(
        { target, from: have, to: want.name, awsCapUsd: cfg.awsCapUsd },
        'autoscale money ceiling updated',
      );
      out[target] = { ceiling: want.name, changed: true, was: have };
    }
    return out;
  }

  /** S9-4: the global daily money brake follows the allowance (CostGuard
   * reads this key; no key = the launch floor). */
  private async writeDailyBrake(allowedUsd: number, days: number) {
    try {
      await this.redis.set(
        ECONOMY_DAILY_BRAKE_KEY,
        String(dailyBrakeCents(allowedUsd, days)),
        'EX',
        ECONOMY_DAILY_BRAKE_TTL_SEC,
      );
    } catch (e) {
      this.fail('daily_brake', e);
    }
  }

  /** Owner 2026-10-25: the three-state controls (off / on / auto) and the
   * ceilings the owner sets in the admin reach the Lambdas through one small
   * S3 object (they cannot read our database). Written only when changed. */
  private async publishScaleControls(): Promise<void> {
    try {
      const bucket = this.storage?.awsBucket('documents');
      if (!this.storage || !bucket) return;
      const [mode, ceiling, spotMode] = await Promise.all([
        this.settingsSvc.string('scale.endpoints.mode'),
        this.settingsSvc.number('scale.endpoints.ceiling'),
        this.settingsSvc.string('scale.spot_fallback.mode').catch(() => 'auto'),
      ]);
      const tri = (m: string) => (m === 'on' || m === 'off' ? m : 'auto');
      const body = JSON.stringify({
        endpoints: {
          mode: tri(mode),
          ceiling: Math.max(0, Math.min(4, Math.floor(ceiling))),
        },
        // Owner 2026-11-12 (row 67): modules/spot-fallback reads this.
        spot_fallback: { mode: tri(spotMode) },
      });
      const last = await this.redis.get(SCALE_CONTROLS_KEY);
      if (last === body) return;
      await this.storage.put(
        bucket,
        'ops/scale-controls.json',
        Buffer.from(body),
        'application/json',
      );
      await this.redis.set(SCALE_CONTROLS_KEY, body, 'EX', 7 * 86_400);
    } catch (e) {
      this.fail('scale_controls', e);
    }
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
      projectedUsd: f.thirdPartyProjectedUsd,
      allowedUsd: f.allowedUsd,
      savedCaps,
    });
    const text =
      `Расходы на сторонние платные сервисы (SMS, видео Bunny, перевод, проверка личности, Cloudflare) за месяц ≈ $${f.thirdPartyProjectedUsd} при допустимых $${f.allowedUsd}. ` +
      'Ограничены только они: лимиты этих сервисов на минимум, новые видео на паузе, SMS только для входа и сброса пароля. Серверы, база и Redis AWS этот тормоз не трогает.';
    await this.event('guard_on', text, now);
    this.logger.warn(
      {
        alert: 'economy_guard_on',
        projectedUsd: f.thirdPartyProjectedUsd,
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
      projectedUsd: f?.thirdPartyProjectedUsd ?? state?.projectedUsd ?? 0,
      allowedUsd: f?.allowedUsd ?? state?.allowedUsd ?? 0,
      savedCaps: {},
    });
    const text = `Ограничения сняты (${why}): лимиты сторонних сервисов, видео и SMS восстановлены.`;
    await this.event('guard_off', text, now);
    this.logger.info({ alert: 'economy_guard_off' }, text);
  }

  /** Economy switched off: the container ceilings go back to the Terraform
   * maximum (an economy «min» is released; an owner's own «min» stays) and
   * the DB / Redis autoscalers get the largest size as their ceiling. */
  private async liftCeilings(now: Date): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    if (this.aws.available) {
      const mode = await this.ops.scaleMode();
      if (mode?.mode === 'min' && mode.source !== 'economy') {
        out.containers = { skipped: 'scaling capped by owner or AWS budget' };
      } else {
        // Owner 2026-11-12 (row 67): the owner's ceiling, no upper bound.
        const max = await this.maxTasks();
        const target = { api: max.api, worker: max.worker };
        await this.aws.setCeilings(target);
        if (mode?.mode === 'min') {
          await this.ops.setScaleMode({
            mode: 'normal',
            by: 'auto',
            at: now.toISOString(),
            source: 'economy',
          });
        }
        out.containers = target;
      }
    }
    out.capacity = await this.applyCapacityCeilings({ awsCapUsd: 0 });
    return out;
  }

  /** The AWS brake (owner 2026-11-08): the container ceiling follows the
   * AWS budget, never the third-party spend. The AWS forecast over the
   * budget → containers at the minimum (released below 90 %, the same
   * hysteresis as the third-party brake); otherwise the ceiling is what the
   * budget's headroom pays for (or the owner's manual number). Video and
   * SMS are never touched here. */
  private async applyCeilings(
    f: EconomyFigures,
    cfg: EconomySettings,
    now: Date,
  ): Promise<Record<string, unknown> | null> {
    if (!this.aws.available) return null;
    const mode = await this.ops.scaleMode();
    const awsHeld = mode?.mode === 'min' && mode.source === 'economy';
    // Owner 2026-11-09: the AWS brake and the money ceiling only with a sum
    // he typed (economy.aws_cap_usd); none = grow by load to Terraform's max.
    const capUsd = cfg.awsCapUsd;
    const awsOver =
      capUsd > 0 && nextGuardActive(awsHeld, f.awsProjectedUsd, capUsd);
    if (awsOver) {
      if (!awsHeld) {
        await this.aws.setScale('min');
        await this.ops.setScaleMode({
          mode: 'min',
          by: 'auto',
          at: now.toISOString(),
          source: 'economy',
        });
        await this.event(
          'ceiling',
          `Счёт AWS за месяц ≈ $${f.awsProjectedUsd} при потолке $${capUsd}: серверов не больше минимума, база и Redis не растут. Видео и SMS этот тормоз не трогает.`,
          now,
        );
      }
      return { mode: 'min', awsProjectedUsd: f.awsProjectedUsd };
    }
    // An owner's or the AWS-budget cap stays until they lift it.
    if (mode?.mode === 'min' && mode.source !== 'economy') {
      return { skipped: 'scaling capped by owner or AWS budget' };
    }
    const min = this.aws.minTasks;
    // Owner 2026-11-12 (row 67): the cap is the owner's number
    // (scale.max_tasks.*, default 100, no upper bound), not Terraform's.
    const hard = { api: cfg.maxTasks.api, worker: cfg.maxTasks.worker };
    let target: Record<TaskKind, number>;
    if (cfg.ceilingMode === 'manual') {
      target = {
        api: manualCeiling(cfg.manualApi, min, hard.api),
        worker: manualCeiling(cfg.manualWorker, min, hard.worker),
      };
    } else if (capUsd <= 0) {
      // No sum typed: the ceiling is the owner's maximum at once.
      target = { api: hard.api, worker: hard.worker };
    } else {
      const counts = await this.aws.taskCounts();
      if (!counts) return null;
      const want = affordableCeilings({
        headroomUsd: capUsd - f.awsProjectedUsd,
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
    if (!this.capacity.readable) return null;
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
    const hot = pressures(
      metrics,
      await this.settingsSvc.number('economy.db_cpu_limit_percent'),
    );
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
    const text = `${what}: ${res.from} → ${res.to} (по кнопке в админке; короткое переключение, секунды-минута).`;
    await this.event('scaled_up', text, now);
    this.logger.warn(
      { alert: 'capacity_scaled_up', target, from: res.from, to: res.to },
      text,
    );
    return res;
  }

  /** Admin button (batch D): database or Redis one tier down. Refused
   * (with the reason) unless the load is low enough to be safe; the
   * caller checks step-up. */
  async decrease(
    target: CapacityTarget,
    now: Date = new Date(),
  ): Promise<
    | { ok: true; from: string; to: string }
    | { ok: false; reason: 'no_smaller' | 'busy'; text: string }
  > {
    const tiers = target === 'db' ? DB_TIERS : REDIS_TIERS;
    const from =
      target === 'db'
        ? await this.capacity.dbClass()
        : await this.capacity.redisClass();
    const fromTier = tiers.find((t) => t.name === from);
    const toTier = prevTier(tiers, from);
    if (!fromTier || !toTier) {
      return {
        ok: false,
        reason: 'no_smaller',
        text: 'Меньшего размера нет (или текущий неизвестен).',
      };
    }
    const m = await this.capacity.metrics(now);
    const blocker = shrinkBlocker(target, fromTier, toTier, m);
    if (blocker) return { ok: false, reason: 'busy', text: blocker };
    const res = await this.capacity.decrease(target);
    if (!res) {
      return { ok: false, reason: 'no_smaller', text: 'Меньшего размера нет.' };
    }
    const what = target === 'db' ? 'База данных' : 'Redis';
    const text = `${what}: ${res.from} → ${res.to} (по кнопке «Уменьшить» в админке; короткое переключение).`;
    await this.event('scaled_down', text, now);
    this.logger.warn(
      { alert: 'capacity_scaled_down', target, from: res.from, to: res.to },
      text,
    );
    return { ok: true, ...res };
  }

  // --- admin card ---------------------------------------------------------

  private tierRows(tiers: readonly Tier[], current: string | null): TierRow[] {
    return tiers.map((t) => ({ ...t, current: t.name === current }));
  }

  /** GET path: the shared summary (see REPORT_* above). */
  async cachedReport(): Promise<EconomyReport> {
    if (!this.summary) return this.build(new Date());
    return this.summary.board<EconomyReport>(
      REPORT_KEY,
      () => this.build(new Date()),
      REPORT_FRESH_MS,
      (d) => !!d?.capacity,
    );
  }

  /** Always computed now (after a button); the result also replaces the
   * shared copy so the next GET shows the state the owner just set. */
  async report(now: Date = new Date()): Promise<EconomyReport> {
    const report = await this.build(now);
    await this.summary?.put(REPORT_KEY, report);
    return report;
  }

  private async build(now: Date): Promise<EconomyReport> {
    const onAws = this.aws.available;
    const cfg = await this.settings();
    // Everything independent at once; the AWS reads each under a time limit.
    const [
      enabled,
      state,
      figures,
      events,
      cap,
      scaleMode,
      applied,
      counts,
      now2,
    ] = await Promise.all([
      this.isEnabled(),
      this.ops.economy(),
      this.figures(now, cfg),
      this.ops.economyEvents(20),
      this.ops.capacity(),
      this.ops.scaleMode(),
      this.ops.ceiling(),
      onAws ? orNull('ecs.taskCounts', () => this.aws.taskCounts()) : null,
      onAws ? orNull('aas.ceilingsNow', () => this.aws.ceilingsNow()) : null,
    ]);
    const container = (kind: TaskKind): ContainerReport => ({
      running: counts?.[kind].running ?? null,
      desired: counts?.[kind].desired ?? null,
      ceiling: now2?.[kind] ?? applied?.[kind] ?? null,
      hardCap: cfg.maxTasks[kind],
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
        dbStorageGb: cap?.dbStorageGb ?? null,
        dbStorageUsd:
          cap?.dbStorageGb != null
            ? dbStorageMonthUsd(cap.dbStorageGb, cap.dbMultiAz ?? true)
            : null,
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

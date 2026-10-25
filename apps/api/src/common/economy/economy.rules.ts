import { daysInMonth } from '../cost-guard/cost-autoscale.rules';

/**
 * Owner 2026-10-16 «не уйти в минус, платя только сторонним системам»:
 * pure rules of the economy guard (no I/O — unit tested in
 * economy.rules.spec.ts). EconomyService feeds them real numbers; the
 * `economy.guard` cron applies the decisions.
 */

/** Share of the allowed spend below which the guard lets go again
 * (hysteresis: no flapping around the line). */
export const RESTORE_RATIO = 0.9;

/** The ceiling never rises by more than this many tasks per 5-minute
 * tick: AWS spend data lags, so growth must be gradual. Lowering is
 * immediate. */
export const MAX_CEILING_STEP_UP = 5;

/** Share of the spare money that goes to API tasks (the rest: worker). */
export const API_SHARE = 0.7;

/** Spend allowed this month: X % of the last 30 days' revenue, but never
 * below the threshold (so a young app with no revenue still has a floor
 * to run on). */
export function allowedSpendUsd(
  revenue30dUsd: number,
  percent: number,
  thresholdUsd: number,
): number {
  const byRule = (Math.max(revenue30dUsd, 0) * Math.max(percent, 0)) / 100;
  return Math.max(byRule, Math.max(thresholdUsd, 0));
}

/** Stripe card fee (2.9 % + 30 ¢ per payment) — the cut Stripe keeps. */
export const STRIPE_FEE_PERCENT = 2.9;
export const STRIPE_FEE_FIXED_CENTS = 30;

export interface RevenueInput {
  /** Σ price before tax of succeeded payments (cents). */
  subtotalCents: number;
  /** Σ amount charged, tax included (cents) — the fee is taken on this. */
  grossCents: number;
  /** Σ succeeded refunds of payments still counted above (cents). */
  refundedCents: number;
  payments: number;
}

/** S9-3: the money the company keeps — price before tax, minus refunds,
 * minus the estimated Stripe fee. Never negative. */
export function netRevenueUsd(i: RevenueInput): number {
  const fee =
    (Math.max(i.grossCents, 0) * STRIPE_FEE_PERCENT) / 100 +
    Math.max(i.payments, 0) * STRIPE_FEE_FIXED_CENTS;
  const net = i.subtotalCents - Math.max(i.refundedCents, 0) - fee;
  return Math.max(net, 0) / 100;
}

/** S9-4: global daily money brake in cents = allowed spend / 30 × days.
 * At least 1 ¢ (a cap of 0 would mean «no cap» downstream). */
export function dailyBrakeCents(allowedUsd: number, days: number): number {
  const d = Math.max(days, 0.5);
  return Math.max(1, Math.round((Math.max(allowedUsd, 0) / 30) * d * 100));
}

/** A vendor reading older than this is not trusted (counters instead). */
export const VENDOR_MAX_AGE_MS = 3 * 86_400_000;

export interface VendorReading {
  status: 'ok' | 'stale' | 'nodata';
  monthToDateUsd: number | null;
  forecastUsd: number | null;
  updatedAt: string | null;
}

/** S9-1: the vendor's own number when its API answered recently, else the
 * counters × the price book (`counterMtdUsd`). */
export function pickVendorLine(
  v: VendorReading | null | undefined,
  counterMtdUsd: number,
  now: Date,
): {
  monthToDateUsd: number;
  projectedUsd: number;
  source: 'actual' | 'estimate';
} {
  const fresh =
    !!v &&
    v.status !== 'nodata' &&
    v.monthToDateUsd !== null &&
    v.updatedAt !== null &&
    now.getTime() - Date.parse(v.updatedAt) <= VENDOR_MAX_AGE_MS;
  if (fresh && v) {
    const mtd = v.monthToDateUsd!;
    return {
      monthToDateUsd: mtd,
      projectedUsd: Math.max(v.forecastUsd ?? projectMonth(mtd, now), mtd),
      source: 'actual',
    };
  }
  return {
    monthToDateUsd: counterMtdUsd,
    projectedUsd: projectMonth(counterMtdUsd, now),
    source: 'estimate',
  };
}

/** S9-14: RDS gp3 storage per month (Multi-AZ doubles it). */
export function dbStorageMonthUsd(gb: number, multiAz: boolean): number {
  return Math.round(Math.max(gb, 0) * (multiAz ? 0.23 : 0.115) * 100) / 100;
}

/** Straight-line month projection (the first days don't extrapolate
 * wildly: at least 3 days count as elapsed — same as cost-autoscale). */
export function projectMonth(monthToDateUsd: number, now: Date): number {
  const mtd = Math.max(monthToDateUsd, 0);
  return (mtd / Math.max(now.getUTCDate(), 3)) * daysInMonth(now);
}

/** Guard on/off with hysteresis: switches on above the allowed spend,
 * off only once the projection is back under 90 % of it. */
export function nextGuardActive(
  active: boolean,
  projectedUsd: number,
  allowedUsd: number,
): boolean {
  if (active) return projectedUsd > allowedUsd * RESTORE_RATIO;
  return projectedUsd > allowedUsd;
}

export interface CeilingInput {
  /** Allowed spend − projected spend now (negative = over the rule). */
  headroomUsd: number;
  apiRunning: number;
  workerRunning: number;
  apiTaskUsd: number;
  workerTaskUsd: number;
  minTasks: number;
  /** Terraform maximum per service (the hard cap). */
  apiHardCap: number;
  workerHardCap: number;
}

export interface Ceilings {
  api: number;
  worker: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * What the rule can afford: the tasks running now plus as many more as
 * the spare money pays for a whole month (70 % of it to API, 30 % to the
 * worker), never below the minimum and never above the Terraform cap. A
 * negative headroom lowers the ceiling to the minimum.
 */
export function affordableCeilings(i: CeilingInput): Ceilings {
  const spare = Math.max(i.headroomUsd, 0);
  // The epsilon absorbs float noise (180 × 0.7 / 18 = 6.999…).
  const tasks = (share: number, taskUsd: number) =>
    Math.floor((spare * share) / Math.max(taskUsd, 0.01) + 1e-9);
  const apiExtra = tasks(API_SHARE, i.apiTaskUsd);
  const workerExtra = tasks(1 - API_SHARE, i.workerTaskUsd);
  const over = i.headroomUsd < 0;
  return {
    api: clamp(
      over ? i.minTasks : i.apiRunning + apiExtra,
      i.minTasks,
      Math.max(i.apiHardCap, i.minTasks),
    ),
    worker: clamp(
      over ? i.minTasks : i.workerRunning + workerExtra,
      i.minTasks,
      Math.max(i.workerHardCap, i.minTasks),
    ),
  };
}

/** Raise gradually, lower at once. `prev` null = nothing applied yet. */
export function limitStepUp(
  prev: number | null,
  target: number,
  maxUp = MAX_CEILING_STEP_UP,
): number {
  if (prev === null || target <= prev) return target;
  return Math.min(target, prev + maxUp);
}

/** Manual mode: the owner's N, never above the Terraform cap nor below
 * the minimum. */
export function manualCeiling(n: number, min: number, hardCap: number): number {
  return clamp(Math.floor(n), min, Math.max(hardCap, min));
}

/** Per-task monthly cost of a Fargate task (x86, us-east-1 list prices). */
export function fargateTaskMonthUsd(vcpu: number, memoryGb: number): number {
  const hours = 730;
  return Math.round(hours * (vcpu * 0.04048 + memoryGb * 0.004445) * 100) / 100;
}

/** S9-7: Graviton (ARM64) Fargate is about 20 % cheaper than x86. */
export const ARM_PRICE_FACTOR = 0.8;
/** S9-7: Fargate Spot is about 70 % cheaper, but each service keeps one
 * on-demand task (capacity-provider base 1), so a blended task costs about
 * 45 % of the on-demand price. Both factors are overridable from env
 * (OPS_ARM_PRICE_FACTOR / OPS_SPOT_PRICE_FACTOR). */
export const SPOT_BLENDED_PRICE_FACTOR = 0.45;

/** What share of the x86 on-demand price a task really costs. */
export function taskPriceFactor(o: {
  arch?: string | null;
  spot: boolean;
  armFactor?: number;
  spotFactor?: number;
}): number {
  const arm = (o.arch ?? '').toUpperCase() === 'ARM64';
  return (
    (arm ? (o.armFactor ?? ARM_PRICE_FACTOR) : 1) *
    (o.spot ? (o.spotFactor ?? SPOT_BLENDED_PRICE_FACTOR) : 1)
  );
}

// --- database / Redis tiers ----------------------------------------------

export interface Tier {
  name: string;
  memoryGb: number;
  /** Approximate list price per month, USD (a hint on the card). */
  monthUsd: number;
}

// ONE ladder with the database autoscaler (infra/modules/db-autoscale,
// docs/architecture/DB_AUTOSCALE.md): the admin button and the Lambda step
// through the same sizes. Prices: Multi-AZ, on demand, us-east-1, 2026-10-24.
export const DB_TIERS: readonly Tier[] = [
  { name: 'db.t4g.micro', memoryGb: 1, monthUsd: 23 },
  { name: 'db.t4g.small', memoryGb: 2, monthUsd: 47 },
  { name: 'db.t4g.medium', memoryGb: 4, monthUsd: 94 },
  { name: 'db.t4g.large', memoryGb: 8, monthUsd: 188 },
  { name: 'db.r7g.large', memoryGb: 16, monthUsd: 349 },
  { name: 'db.r7g.xlarge', memoryGb: 32, monthUsd: 698 },
  { name: 'db.r7g.2xlarge', memoryGb: 64, monthUsd: 1396 },
];

// ONE ladder with the Redis autoscaler (infra/modules/redis-autoscale,
// docs/architecture/REDIS_AUTOSCALE.md). memoryGb = ElastiCache node memory;
// monthUsd = the whole group with ONE replica (2 nodes), on demand,
// us-east-1, AWS Price List API 2026-10-24.
export const REDIS_TIERS: readonly Tier[] = [
  { name: 'cache.t4g.micro', memoryGb: 0.5, monthUsd: 23 },
  { name: 'cache.t4g.small', memoryGb: 1.37, monthUsd: 47 },
  { name: 'cache.t4g.medium', memoryGb: 3.09, monthUsd: 95 },
  { name: 'cache.r7g.large', memoryGb: 13.07, monthUsd: 320 },
  { name: 'cache.r7g.xlarge', memoryGb: 26.32, monthUsd: 638 },
  { name: 'cache.r7g.2xlarge', memoryGb: 52.82, monthUsd: 1275 },
];

/** The next bigger tier, or null (unknown class or already the largest). */
export function nextTier(
  tiers: readonly Tier[],
  current: string | null | undefined,
): Tier | null {
  const i = tiers.findIndex((t) => t.name === current);
  return i >= 0 && i + 1 < tiers.length ? tiers[i + 1] : null;
}

/** The next smaller tier, or null (unknown class or already the smallest). */
export function prevTier(
  tiers: readonly Tier[],
  current: string | null | undefined,
): Tier | null {
  const i = tiers.findIndex((t) => t.name === current);
  return i > 0 ? tiers[i - 1] : null;
}

/** Shrink only when the load is as low as the autoscaler itself requires
 * (docs/architecture/DB_AUTOSCALE.md: CPU at most 30 %, connections at most
 * 40 % of the limit). Redis: the used memory must fit in half of the
 * smaller node. */
export const SHRINK_DB_CPU_PERCENT = 30;
export const SHRINK_DB_CONN_PERCENT = 40;
export const SHRINK_REDIS_MEM_PERCENT = 50;

/** Why a manual «уменьшить» must be refused, or null when it is safe.
 * Unknown load (no metric) refuses: never shrink blind. */
export function shrinkBlocker(
  target: 'db' | 'redis',
  from: Tier,
  to: Tier,
  m: {
    dbCpuPercent: number | null;
    dbConnections: number | null;
    redisMemoryPercent: number | null;
  },
): string | null {
  if (target === 'db') {
    if (m.dbCpuPercent == null || m.dbConnections == null) {
      return 'Нагрузка базы неизвестна: уменьшать вслепую нельзя.';
    }
    if (m.dbCpuPercent > SHRINK_DB_CPU_PERCENT) {
      return `Процессор занят на ${Math.round(m.dbCpuPercent)} %: на меньшем размере базе будет тесно (нужно не больше ${SHRINK_DB_CPU_PERCENT} %).`;
    }
    const limit = dbMaxConnections(to.memoryGb);
    const pct = (m.dbConnections / limit) * 100;
    if (pct > SHRINK_DB_CONN_PERCENT) {
      return `Соединений ${Math.round(m.dbConnections)} из ${limit} на меньшем размере (${Math.round(pct)} %, нужно не больше ${SHRINK_DB_CONN_PERCENT} %).`;
    }
    return null;
  }
  if (m.redisMemoryPercent == null) {
    return 'Занятость памяти Redis неизвестна: уменьшать вслепую нельзя.';
  }
  const after = (m.redisMemoryPercent * from.memoryGb) / to.memoryGb;
  if (after > SHRINK_REDIS_MEM_PERCENT) {
    return `На меньшем размере память Redis была бы занята на ${Math.round(after)} % (нужно не больше ${SHRINK_REDIS_MEM_PERCENT} %).`;
  }
  return null;
}

/** PostgreSQL on RDS: LEAST(memory / 9531392 bytes, 5000) connections. */
export function dbMaxConnections(memoryGb: number): number {
  return Math.min(Math.floor((memoryGb * 1024 ** 3) / 9_531_392), 5000);
}

export const DB_CPU_LIMIT_PERCENT = 70;
export const DB_CONN_LIMIT_PERCENT = 80;
export const REDIS_MEM_LIMIT_PERCENT = 75;

export type PressureKind = 'db_cpu' | 'db_connections' | 'redis_memory';

export interface Pressure {
  kind: PressureKind;
  value: number;
  limit: number;
}

/** Which resource limits are crossed (values in percent). */
export function pressures(m: {
  dbCpuPercent?: number | null;
  dbConnections?: number | null;
  dbMaxConnections?: number | null;
  redisMemoryPercent?: number | null;
}): Pressure[] {
  const out: Pressure[] = [];
  if (m.dbCpuPercent != null && m.dbCpuPercent > DB_CPU_LIMIT_PERCENT) {
    out.push({
      kind: 'db_cpu',
      value: m.dbCpuPercent,
      limit: DB_CPU_LIMIT_PERCENT,
    });
  }
  if (m.dbConnections != null && m.dbMaxConnections) {
    const pct = (m.dbConnections / m.dbMaxConnections) * 100;
    if (pct > DB_CONN_LIMIT_PERCENT) {
      out.push({
        kind: 'db_connections',
        value: pct,
        limit: DB_CONN_LIMIT_PERCENT,
      });
    }
  }
  if (
    m.redisMemoryPercent != null &&
    m.redisMemoryPercent > REDIS_MEM_LIMIT_PERCENT
  ) {
    out.push({
      kind: 'redis_memory',
      value: m.redisMemoryPercent,
      limit: REDIS_MEM_LIMIT_PERCENT,
    });
  }
  return out;
}

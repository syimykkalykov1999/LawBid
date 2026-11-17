import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  DescribeReplicationGroupsCommand,
  DecreaseReplicaCountCommand,
  ElastiCacheClient,
  IncreaseReplicaCountCommand,
  ModifyReplicationGroupCommand,
} from '@aws-sdk/client-elasticache';
import {
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand,
  RDSClient,
} from '@aws-sdk/client-rds';
import type Redis from 'ioredis';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { autoCheckMs, autoLockTtlS } from './auto-check';
import { infraWritesOff } from './infra-writes';
import { opsCredentials } from './ops-credentials';
import { OpsStateService } from './ops-state.service';

export type HaAction =
  | 'db_multi_az_on'
  | 'db_multi_az_off'
  // Row 203: an extra database server followed the primary (reported only).
  | 'db_shard_multi_az_on'
  | 'db_shard_multi_az_off'
  | 'redis_replica_up'
  | 'redis_failover_on'
  | 'redis_failover_off'
  | 'redis_replica_down';

type Dir = 'up' | 'down';

export interface HaFacts {
  /** `ha.mode`: off = hands off, on = keep the copies, auto = by load. */
  mode: string;
  /** `ha.provision_online_users`; 0 = never add by load. */
  threshold: number;
  /** Hourly average of people online (open sockets), oldest first,
   * null = no data in that hour. With ha.release_minutes the points are
   * minutes. The quiet (remove) window. */
  online: (number | null)[];
  /** 15.11 (live tests within 10 min): the busy (add) window when it is not
   * the last HA_HOURS hours of [online]: the last ha.provision_minutes
   * minutes. Every point with data at or above the threshold, data for 90 %
   * of them. */
  onlineUp?: (number | null)[];
  nowMs: number;
  db: { multiAz: boolean; available: boolean; pending: boolean } | null;
  redis: {
    replicas: number;
    failover: boolean;
    available: boolean;
  } | null;
  /** The last step taken per resource (direction and time). */
  last: Partial<Record<'db' | 'redis', { dir: Dir; atMs: number } | undefined>>;
  /**
   * Automation audit 2026-11-08: the database / Redis is busy right now
   * (CPU or memory over the size autoscaler's line for 30 minutes). The size
   * autoscalers refuse to resize without the copies (not_multi_az /
   * no_failover), so a busy resource without copies was stuck at its size
   * (prod 08.11). Busy = add the copies first, whatever the online count.
   */
  pressure?: { db: boolean; redis: boolean };
  /** Owner 14.11: the opposite-direction guard (ha.flip_guard_minutes);
   * default HA_FLIP_MS (24 h). */
  flipMs?: number;
  /** Owner 14.11: points of quiet data needed to remove the copies when
   * ha.release_minutes is set (minutes since 15.11); default more than
   * HA_HOURS. */
  minQuietHours?: number;
  /**
   * G10 (2026-11-08): money. `limited` = the economy guard is in its
   * «limited» state (projected third-party spend over the allowance);
   * `budgetLeftUsd` = AWS budget minus this month's forecast (null =
   * unknown). Read from the economy job's and the cost check's snapshots.
   */
  money?: { limited: boolean; budgetLeftUsd: number | null };
}

/** Row 203 (16.11): an extra database server («Авто», aws.db_shards). */
export interface HaShard {
  id: string;
  multiAz: boolean;
  available: boolean;
  pending: boolean;
}

/** One Multi-AZ change of an extra database server. */
export interface HaShardStep {
  id: string;
  multiAz: boolean;
}

/**
 * Row 203 (16.11), pure: the extra database servers keep the primary's
 * Multi-AZ. They were created with the tfvars number (database_multi_az,
 * false on prod) and modules/postgres ignores multi_az afterwards, so when
 * «Авто» turned the primary's standby on, the servers holding the other
 * parts of the data stayed on one zone. Target = the primary's Multi-AZ
 * after this pass's own step. Same rules as the primary: «Выкл» = hands off,
 * AWS must be idle with the server, and in «Авто» nothing is ADDED while
 * money says no (haMoneyHold); removing is never held back.
 */
export function shardHaSteps(
  f: HaFacts,
  primarySteps: HaAction[],
  shards: HaShard[],
): HaShardStep[] {
  if (f.mode === 'off' || !f.db) return [];
  const target = primarySteps.includes('db_multi_az_on')
    ? true
    : primarySteps.includes('db_multi_az_off')
      ? false
      : f.db.multiAz;
  if (target && haMoneyHold(f)) return [];
  return shards
    .filter((s) => s.available && !s.pending && s.multiAz !== target)
    .map((s) => ({ id: s.id, multiAz: target }));
}

/** What the copies cost a month (Multi-AZ of db.t4g.micro + one Redis node). */
export const HA_USD_MONTH = 26;

/**
 * G10, pure: in «Авто» the copies are not ADDED while money says no — the
 * economy guard is limited, or the AWS month would end over its budget with
 * them. Removing is never held back by money, and «Вкл» (the owner's own
 * choice) is not touched. Same rule as the infra automation (money_budget).
 */
export function haMoneyHold(f: HaFacts): string | null {
  if (f.mode !== 'auto' || !f.money) return null;
  if (f.money.limited) return 'economy guard is limited';
  const left = f.money.budgetLeftUsd;
  if (left !== null && left < HA_USD_MONTH) {
    return `AWS budget left ${Math.round(left)} USD < ${HA_USD_MONTH} USD a month for the copies`;
  }
  return null;
}

/** Line and window of the «busy» signal (the size autoscaler's own up line). */
export const HA_PRESSURE_PCT = 70;
export const HA_PRESSURE_MEM_PCT = 80;
export const HA_PRESSURE_MINUTES = 30;

/** Hours in a row the load must stay above the threshold to add copies. */
export const HA_HOURS = 3;
/** The opposite direction waits this long after the last step. */
export const HA_FLIP_MS = 24 * 3600_000;
/** Share of the quiet window that must have data before copies are removed. */
const MIN_DATA = 0.9;
/** 15.11: a minute window longer than one day reads hourly points (one
 * CloudWatch call returns at most 1440 points). */
const MINUTE_POINTS_MAX = 1440;
/** The newest minutes CloudWatch may still be filling (one sample per task
 * per minute arrives with a short delay). */
const MINUTE_LAG_MS = 2 * 60_000;

/** 15.11: which points a window reads: minutes when a minute setting is
 * above 0 and at most one day, else full hours. */
export interface HaWindow {
  points: number;
  periodS: 60 | 3600;
}

export function haWindow(defaultMinutes: number, minutes: number): HaWindow {
  if (minutes > 0 && minutes <= MINUTE_POINTS_MAX) {
    return { points: Math.ceil(minutes), periodS: 60 };
  }
  const m = minutes > 0 ? minutes : defaultMinutes;
  return { points: Math.max(1, Math.ceil(m / 60)), periodS: 3600 };
}

/** What the load says: add, remove or leave as is. Pure. */
export function wantedHa(f: HaFacts): Dir | null {
  if (f.mode === 'off') return null;
  if (f.mode === 'on') return 'up';
  if (f.pressure?.db || f.pressure?.redis) return 'up';
  if (f.threshold <= 0) return null;
  if (f.onlineUp) {
    const up = f.onlineUp.filter((v): v is number => v !== null);
    if (
      f.onlineUp.length > 0 &&
      up.length >= f.onlineUp.length * MIN_DATA &&
      up.every((v) => v >= f.threshold)
    ) {
      return 'up';
    }
  } else {
    const last = f.online.slice(-HA_HOURS);
    if (
      last.length === HA_HOURS &&
      last.every((v) => v !== null && v >= f.threshold)
    ) {
      return 'up';
    }
  }
  const have = f.online.filter((v): v is number => v !== null);
  if (
    f.online.length >= (f.minQuietHours ?? HA_HOURS + 1) &&
    have.length >= f.online.length * MIN_DATA &&
    have.every((v) => v < f.threshold / 2)
  ) {
    return 'down';
  }
  return null;
}

/**
 * Pure: which high-availability steps to take now. Copies are added after 3
 * busy hours and removed after a long quiet stretch (half the threshold for
 * `ha.release_days` days, with data for 90 % of the hours, so a missing metric
 * never removes anything). A step in the opposite direction of the last one
 * waits 24 h, so the database is not flipped back and forth. AWS must be
 * idle with the resource. Redis takes two steps each way: up = replica, then
 * failover; down = failover off, then the replica away.
 */
export function decideHa(f: HaFacts): HaAction[] {
  if (f.mode === 'off') return [];
  const out = decideHaSteps(f);
  return haMoneyHold(f) ? out.filter((a) => dirOf(a) === 'down') : out;
}

function decideHaSteps(f: HaFacts): HaAction[] {
  const load = wantedHa(f);
  // A started Redis sequence is finished in its own direction for 24 h even
  // if the load drifted into the band between the two thresholds, so the
  // group is never left with a paid node and failover off (or the reverse).
  const unfinished = (r: 'db' | 'redis'): Dir | null => {
    const l = f.last[r];
    return l && f.nowMs - l.atMs < (f.flipMs ?? HA_FLIP_MS) ? l.dir : null;
  };
  const out: HaAction[] = [];
  const db = f.db;
  const dbWant = load;
  // A busy resource gets its copies at once, also within 24 h of a removal:
  // an overload (the size autoscaler stuck without copies) costs more than
  // one flip (about $1 a day).
  const busy = !!(f.pressure?.db || f.pressure?.redis);
  const free = (r: 'db' | 'redis', want: Dir): boolean => {
    const l = f.last[r];
    if (want === 'up' && busy) return true;
    return !l || l.dir === want || f.nowMs - l.atMs >= (f.flipMs ?? HA_FLIP_MS);
  };
  if (dbWant && db && db.available && !db.pending && free('db', dbWant)) {
    if (dbWant === 'up' && !db.multiAz) out.push('db_multi_az_on');
    if (dbWant === 'down' && db.multiAz) out.push('db_multi_az_off');
  }
  const rd = f.redis;
  const want = load ?? unfinished('redis');
  if (want && rd && rd.available && free('redis', want)) {
    if (want === 'up') {
      if (rd.replicas < 1) out.push('redis_replica_up');
      else if (!rd.failover) out.push('redis_failover_on');
    } else if (rd.failover) {
      out.push('redis_failover_off');
    } else if (rd.replicas > 0) {
      out.push('redis_replica_down');
    }
  }
  return out;
}

const LOCK_KEY = 'ops:ha-auto:lock';
const LAST_PREFIX = 'ops:ha-auto:last:';
const LAST_TTL_S = 60 * 24 * 3600;

const resourceOf = (a: HaAction): 'db' | 'redis' =>
  a.startsWith('db') ? 'db' : 'redis';
const dirOf = (a: HaAction): Dir =>
  a === 'db_multi_az_on' ||
  a === 'redis_replica_up' ||
  a === 'redis_failover_on'
    ? 'up'
    : 'down';

/**
 * Owner 2026-11-02: the second copy of the database (Multi-AZ) and the
 * Redis standby node cost about $26 a month and pay off only once people
 * depend on the app, so they come and go by themselves, with the load: no
 * code change, no AWS console, no terminal.
 *
 * Admin → Настройки: `ha.mode` (off | on | auto, default auto),
 * `ha.provision_online_users` (default 200), `ha.release_days` (default 7).
 * One API task per `infra.auto_check_minutes` (default 10; Redis lock)
 * reads the number of open sockets (`LawBid/Runtime` OpenSockets, one
 * sample per task per minute). Added after 3 full hours (or
 * `ha.provision_minutes` minutes) at or above the threshold; removed after
 * `ha.release_days` days (or `ha.release_minutes`) all under half of it. See [decideHa] for the
 * guards. Needs the task's IAM rights (rds:ModifyDBInstance and
 * elasticache:IncreaseReplicaCount / DecreaseReplicaCount /
 * ModifyReplicationGroup). The autoscalers of the database size and of Redis
 * refuse to resize without the copies (a one-node resize means minutes of
 * downtime), so they start by themselves once the copies exist.
 */
@Injectable()
export class HaAutoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('HaAuto');
  private timer?: NodeJS.Timeout;
  private cw?: CloudWatchClient;
  private rds?: RDSClient;
  private cache?: ElastiCacheClient;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
    // G10: the economy state and the AWS budget reading (both in Redis).
    @Optional() private readonly ops?: OpsStateService,
  ) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }
  private region(): string {
    return this.env('AWS_REGION') ?? this.env('S3_REGION') ?? 'us-east-1';
  }
  private creds() {
    return opsCredentials((n) => this.env(n), this.region());
  }

  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID || process.argv[1]?.includes('worker')) {
      return;
    }
    // Row 204 (task_role_split): the public api's task role cannot change the
    // database or Redis; only api-admin (no such flag) runs this loop.
    if (infraWritesOff()) return;
    if (!this.env('OPS_DB_INSTANCE') && !this.env('OPS_REDIS_GROUP')) return;
    // 15.11: the pause between passes is infra.auto_check_minutes, read
    // after every pass (a setTimeout chain instead of a fixed interval).
    const loop = async () => {
      await this.check().catch((e: Error) =>
        this.log.warn(`ha-auto pass failed: ${e.message}`),
      );
      this.schedule(loop, await this.checkMs());
    };
    this.schedule(loop, 90_000 + Math.floor(Math.random() * 30_000));
  }

  private stopped = false;
  private schedule(fn: () => Promise<void>, ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void fn(), ms);
    this.timer.unref();
  }

  /** 15.11: infra.auto_check_minutes (default 10). */
  async checkMs(): Promise<number> {
    return autoCheckMs(
      await this.settings?.number('infra.auto_check_minutes').catch(() => 0),
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** One pass; returns what it did (for tests and the logs). */
  async check(): Promise<HaAction[]> {
    // Only the exact words act; a typo ("Off", " of") means hands off.
    const raw =
      (await this.settings?.string('ha.mode').catch(() => 'off')) ?? 'off';
    const mode = raw.trim().toLowerCase();
    if (mode !== 'on' && mode !== 'auto') return [];
    const num = async (
      k:
        | 'ha.provision_online_users'
        | 'ha.provision_minutes'
        | 'ha.release_days'
        | 'ha.release_minutes'
        | 'ha.flip_guard_minutes',
    ) => (await this.settings?.number(k).catch(() => 0)) ?? 0;
    const threshold = await num('ha.provision_online_users');
    // Owner 14.11 («no limits»): no 30-day ceiling; floor 1 day.
    const days = Math.max(1, (await num('ha.release_days')) || 7);
    // Owner 14.11: waits in minutes for live tests (0 = the days / 24 h).
    const releaseMinutes = Math.max(0, await num('ha.release_minutes'));
    // 15.11 (live tests within 10 min): the busy window in minutes
    // (0 = the 3 full hours of before).
    const provisionMinutes = Math.max(0, await num('ha.provision_minutes'));
    const down = haWindow(days * 24 * 60, releaseMinutes);
    const up = haWindow(HA_HOURS * 60, provisionMinutes);
    const flipMinutes = Math.max(0, await num('ha.flip_guard_minutes'));
    const got = await this.redis
      ?.set(LOCK_KEY, '1', 'EX', autoLockTtlS(await this.checkMs()), 'NX')
      .catch(() => null);
    if (!got) return [];
    const nowMs = Date.now();
    // Independent reads: one failing (a missing permission, a throttle) must
    // not stop the others, and is logged instead of swallowed.
    const soft = async <T>(what: string, fb: T, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (e) {
        this.log.warn(
          `ha-auto: reading ${what} failed: ${(e as Error).message}`,
        );
        return fb;
      }
    };
    const [online, onlineUp, db, redis, dbBusy, redisBusy, shards] =
      await Promise.all([
        soft('online users', [] as (number | null)[], () =>
          this.onlineSeries(down, nowMs),
        ),
        soft('online users (busy window)', [] as (number | null)[], () =>
          this.onlineSeries(up, nowMs),
        ),
        soft('database', null as HaFacts['db'], () => this.dbFacts()),
        soft('redis', null as HaFacts['redis'], () => this.redisFacts()),
        soft('database load', false, () => this.dbBusy(nowMs)),
        soft('redis load', false, () => this.redisBusy(nowMs)),
        soft('extra database servers', [] as HaShard[], () =>
          this.shardFacts(),
        ),
      ]);
    const facts: HaFacts = {
      mode: mode === 'on' ? 'on' : 'auto',
      threshold,
      online,
      onlineUp,
      nowMs,
      db,
      redis,
      pressure: { db: dbBusy, redis: redisBusy },
      ...(releaseMinutes > 0 ? { minQuietHours: down.points } : {}),
      ...(flipMinutes > 0 ? { flipMs: flipMinutes * 60_000 } : {}),
      money: await soft('money', undefined as HaFacts['money'], () =>
        this.money(),
      ),
      last: {
        db: await this.lastStep('db'),
        redis: await this.lastStep('redis'),
      },
    };
    const hold = haMoneyHold(facts);
    if (hold && decideHaSteps(facts).some((a) => dirOf(a) === 'up')) {
      this.log.warn(`ha-auto: copies wanted but held back: ${hold}`);
    }
    const done: HaAction[] = [];
    const steps = decideHa(facts);
    for (const a of steps) {
      try {
        await this.run(a);
        done.push(a);
        await this.redis
          ?.set(
            LAST_PREFIX + resourceOf(a),
            `${dirOf(a)}:${nowMs}`,
            'EX',
            LAST_TTL_S,
          )
          .catch(() => undefined);
        this.log.warn(
          `ha-auto: ${a} (mode ${mode}, threshold ${threshold}, busy db ${dbBusy} redis ${redisBusy})`,
        );
      } catch (e) {
        this.log.error(`${a} failed: ${(e as Error).message}`);
      }
    }
    // Row 203: the extra database servers follow the primary's Multi-AZ
    // (also when the primary's own step failed: the target is then what
    // AWS reported for it this pass, never a guess).
    const primary = steps.filter((a) => done.includes(a));
    for (const s of shardHaSteps(facts, primary, shards)) {
      try {
        await this.rdsClient().send(
          new ModifyDBInstanceCommand({
            DBInstanceIdentifier: s.id,
            MultiAZ: s.multiAz,
            ApplyImmediately: true,
          }),
        );
        done.push(s.multiAz ? 'db_shard_multi_az_on' : 'db_shard_multi_az_off');
        this.log.warn(
          `ha-auto: extra database server ${s.id} Multi-AZ ${s.multiAz ? 'on' : 'off'} (follows the primary)`,
        );
      } catch (e) {
        this.log.error(
          `extra database server ${s.id} Multi-AZ failed: ${(e as Error).message}`,
        );
      }
    }
    return done;
  }

  /** Row 203: the extra database servers (OPS_DB_SHARD_INSTANCES, set by
   * the stack when aws.db_shards > 0). One missing server is skipped. */
  private async shardFacts(): Promise<HaShard[]> {
    const ids = (this.env('OPS_DB_SHARD_INSTANCES') ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const out: HaShard[] = [];
    for (const id of ids) {
      const r = await this.rdsClient()
        .send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }))
        .catch((e: Error) => {
          this.log.warn(`ha-auto: reading ${id} failed: ${e.message}`);
          return null;
        });
      const i = r?.DBInstances?.[0];
      if (!i) continue;
      out.push({
        id,
        multiAz: !!i.MultiAZ,
        available: i.DBInstanceStatus === 'available',
        pending: Object.keys(i.PendingModifiedValues ?? {}).length > 0,
      });
    }
    return out;
  }

  /** G10: the money facts from the snapshots the other jobs keep. */
  private async money(): Promise<HaFacts['money']> {
    if (!this.ops) return undefined;
    // Owner 2026-11-09: no money hold unless he typed an AWS ceiling.
    const capUsd = (await this.settings?.number('economy.aws_cap_usd')) ?? 0;
    if (!(Number.isFinite(capUsd) && capUsd > 0)) return undefined;
    const [econ, cost] = await Promise.all([
      this.ops.economy(),
      this.ops.cost(),
    ]);
    const spent = cost ? (cost.forecastUsd ?? cost.actualUsd) : null;
    return {
      limited: econ?.guard === 'limited',
      budgetLeftUsd:
        cost && spent !== null && cost.limitUsd > 0
          ? cost.limitUsd - spent
          : null,
    };
  }

  private async lastStep(r: 'db' | 'redis'): Promise<HaFacts['last']['db']> {
    const v = await this.redis?.get(LAST_PREFIX + r).catch(() => null);
    const m = /^(up|down):(\d+)$/.exec(v ?? '');
    return m ? { dir: m[1] as Dir, atMs: Number(m[2]) } : undefined;
  }

  /** People online per point (full hour or full minute), oldest first;
   * null = a point without data. */
  async onlineSeries(w: HaWindow, nowMs: number): Promise<(number | null)[]> {
    const stepMs = w.periodS * 1000;
    const endMs =
      w.periodS === 60
        ? Math.floor((nowMs - MINUTE_LAG_MS) / stepMs) * stepMs
        : Math.floor(nowMs / stepMs) * stepMs;
    const startMs = endMs - w.points * stepMs;
    const r = await this.cwClient().send(
      new GetMetricStatisticsCommand({
        Namespace: 'LawBid/Runtime',
        MetricName: 'OpenSockets',
        Dimensions: [{ Name: 'Service', Value: 'api' }],
        StartTime: new Date(startMs),
        EndTime: new Date(endMs),
        Period: w.periodS,
        Statistics: ['Sum'],
      }),
    );
    const out: (number | null)[] = new Array<number | null>(w.points).fill(
      null,
    );
    // One sample per api task per minute: Sum / minutes in the point =
    // people online.
    const perPoint = w.periodS / 60;
    for (const d of r.Datapoints ?? []) {
      const i = Math.floor(((d.Timestamp?.getTime() ?? 0) - startMs) / stepMs);
      if (i >= 0 && i < w.points) out[i] = (d.Sum ?? 0) / perPoint;
    }
    return out;
  }

  /** Every 5-minute point of the last 30 minutes at or over [pct]; a
   * missing point means «not busy» (never adds copies on no data). */
  private async sustained(
    namespace: string,
    metric: string,
    dims: { Name: string; Value: string }[],
    pct: number,
    nowMs: number,
  ): Promise<boolean> {
    const r = await this.cwClient().send(
      new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metric,
        Dimensions: dims,
        StartTime: new Date(nowMs - HA_PRESSURE_MINUTES * 60_000),
        EndTime: new Date(nowMs),
        Period: 300,
        Statistics: ['Average'],
      }),
    );
    const pts = (r.Datapoints ?? []).map((d) => d.Average ?? 0);
    return (
      pts.length >= Math.floor(HA_PRESSURE_MINUTES / 5) - 1 &&
      pts.every((v) => v >= pct)
    );
  }

  private async dbBusy(nowMs: number): Promise<boolean> {
    const id = this.env('OPS_DB_INSTANCE');
    if (!id) return false;
    return this.sustained(
      'AWS/RDS',
      'CPUUtilization',
      [{ Name: 'DBInstanceIdentifier', Value: id }],
      HA_PRESSURE_PCT,
      nowMs,
    );
  }

  private async redisBusy(nowMs: number): Promise<boolean> {
    const id = this.env('OPS_REDIS_GROUP');
    if (!id) return false;
    // A one-node group's node is <group>-001.
    const dims = [{ Name: 'CacheClusterId', Value: `${id}-001` }];
    const [cpu, mem] = await Promise.all([
      this.sustained(
        'AWS/ElastiCache',
        'EngineCPUUtilization',
        dims,
        HA_PRESSURE_PCT,
        nowMs,
      ),
      this.sustained(
        'AWS/ElastiCache',
        'DatabaseMemoryUsagePercentage',
        dims,
        HA_PRESSURE_MEM_PCT,
        nowMs,
      ),
    ]);
    return cpu || mem;
  }

  private cwClient(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({
      region: this.region(),
      credentials: this.creds(),
    }));
  }
  private rdsClient(): RDSClient {
    return (this.rds ??= new RDSClient({
      region: this.region(),
      credentials: this.creds(),
    }));
  }
  private cacheClient(): ElastiCacheClient {
    return (this.cache ??= new ElastiCacheClient({
      region: this.region(),
      credentials: this.creds(),
    }));
  }

  private async dbFacts(): Promise<HaFacts['db']> {
    const id = this.env('OPS_DB_INSTANCE');
    if (!id) return null;
    const r = await this.rdsClient().send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: id }),
    );
    const i = r.DBInstances?.[0];
    if (!i) return null;
    return {
      multiAz: !!i.MultiAZ,
      available: i.DBInstanceStatus === 'available',
      pending: Object.keys(i.PendingModifiedValues ?? {}).length > 0,
    };
  }

  private async redisFacts(): Promise<HaFacts['redis']> {
    const id = this.env('OPS_REDIS_GROUP');
    if (!id) return null;
    const r = await this.cacheClient().send(
      new DescribeReplicationGroupsCommand({ ReplicationGroupId: id }),
    );
    const g = r.ReplicationGroups?.[0];
    if (!g) return null;
    // A cluster-mode group (several shards) is not handled here.
    if ((g.NodeGroups?.length ?? 1) !== 1) return null;
    return {
      replicas: Math.max(0, (g.MemberClusters?.length ?? 1) - 1),
      failover: g.AutomaticFailover === 'enabled',
      available: g.Status === 'available',
    };
  }

  private async run(a: HaAction): Promise<void> {
    const group = this.env('OPS_REDIS_GROUP');
    switch (a) {
      case 'db_multi_az_on':
      case 'db_multi_az_off':
        await this.rdsClient().send(
          new ModifyDBInstanceCommand({
            DBInstanceIdentifier: this.env('OPS_DB_INSTANCE'),
            MultiAZ: a === 'db_multi_az_on',
            ApplyImmediately: true,
          }),
        );
        return;
      case 'redis_replica_up':
        await this.cacheClient().send(
          new IncreaseReplicaCountCommand({
            ReplicationGroupId: group,
            NewReplicaCount: 1,
            ApplyImmediately: true,
          }),
        );
        return;
      case 'redis_replica_down':
        await this.cacheClient().send(
          new DecreaseReplicaCountCommand({
            ReplicationGroupId: group,
            NewReplicaCount: 0,
            ApplyImmediately: true,
          }),
        );
        return;
      default:
        await this.cacheClient().send(
          new ModifyReplicationGroupCommand({
            ReplicationGroupId: group,
            AutomaticFailoverEnabled: a === 'redis_failover_on',
            MultiAZEnabled: a === 'redis_failover_on',
            ApplyImmediately: true,
          }),
        );
    }
  }
}

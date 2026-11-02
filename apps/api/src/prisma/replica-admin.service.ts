import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  CreateDBInstanceReadReplicaCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  RDSClient,
} from '@aws-sdk/client-rds';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { AppSettingsService } from '../common/app-settings/app-settings.service';
import { replicaLive } from './replica-live';

export type ReplicaState =
  | 'unavailable' // not on AWS, or the IAM switch is off
  | 'off'
  | 'creating'
  | 'on'
  | 'lagging'
  | 'deleting'
  | 'error';

export interface ReplicaStatus {
  state: ReplicaState;
  /** Seconds behind the primary (null while unknown). */
  lagSeconds: number | null;
  instanceClass: string | null;
  /** True while this process really sends reads to the replica. */
  serving: boolean;
  note: string;
}

const CACHE_KEY = 'ops:db-replica:status';
const CACHE_TTL_S = 25;
/** Start sending reads at or below, stop above (seconds). */
export const LAG_START_S = 10;
export const LAG_STOP_S = 30;

/**
 * Owner 2026-10-24: «Копия базы для чтения» on the admin «Масштаб» page.
 *
 * The tap creates / deletes ONE read replica through the RDS API with the
 * API task role (Terraform grants exactly that when `db_replica_toggle` is
 * true). RDS does the 15-30 minute copy by itself, so no Lambda or waiting
 * process is needed; this service only asks RDS "what is it now" (cached in
 * Redis for 25 s, so 70 tasks make about two calls per half minute) and:
 *   - sends lag-tolerant reads (`PrismaReadService.db`) to the replica only
 *     while it is `available` and at most 10 s behind (stops above 30 s);
 *   - goes back to the primary on its own when the replica is gone, still
 *     being created, deleting, failed or lagging.
 * Terraform does not own this replica (it is created outside the state), so
 * `terraform apply` can never delete or recreate it; `growth.rds_read_replicas`
 * keeps owning its own, differently named, replicas.
 */
@Injectable()
export class ReplicaAdminService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ReplicaAdmin');
  private rds?: RDSClient;
  private cw?: CloudWatchClient;
  private timer?: NodeJS.Timeout;
  private autoTimer?: NodeJS.Timeout;
  private serving = false;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  private region(): string {
    return this.env('AWS_REGION') ?? this.env('S3_REGION') ?? 'us-east-1';
  }

  /** The IAM switch is on (Terraform `db_replica_toggle`) and the primary is named. */
  get available(): boolean {
    return this.env('OPS_DB_REPLICA_TOGGLE') === 'on' && !!this.primaryId;
  }

  get primaryId(): string | undefined {
    return this.env('OPS_DB_INSTANCE');
  }

  get replicaId(): string {
    return `${this.primaryId ?? 'db'}-readreplica`;
  }

  private rdsClient(): RDSClient {
    return (this.rds ??= new RDSClient({ region: this.region() }));
  }
  private cwClient(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({ region: this.region() }));
  }

  onModuleInit(): void {
    if (!this.available || process.env.JEST_WORKER_ID) return;
    const tick = () => void this.refresh().catch(() => undefined);
    // Staggered start so 70 tasks do not all ask at the same second.
    setTimeout(tick, Math.floor(Math.random() * 5000)).unref();
    this.timer = setInterval(tick, 30_000);
    this.timer.unref();
    // Auto growth: look at the primary's CPU every 10 minutes (one task wins
    // the Redis lock, so 70 tasks make one CloudWatch call per 10 minutes).
    const autoTick = () => void this.autoCheck().catch(() => undefined);
    setTimeout(autoTick, 60_000 + Math.floor(Math.random() * 30_000)).unref();
    this.autoTimer = setInterval(autoTick, AUTO_CHECK_MS);
    this.autoTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.autoTimer) clearInterval(this.autoTimer);
    replicaLive.set(null);
  }

  /**
   * Owner 2026-11-02 («с ростом включается само»): when the primary has been
   * busy for hours although the database autoscaler is already on its
   * ceiling, the read replica is created without a tap. Setting
   * `db.replica_provision`: `off` = never, `auto` (default) = create on
   * sustained load. It is inert unless Terraform `db_replica_toggle` gave the
   * task the IAM rights, and it creates the same single replica the button
   * creates (same size, same name), at most once a day. It never deletes:
   * deleting stays a tap with a second admin and a fresh 2FA code, because
   * the replica itself lowers the primary's CPU and a "quiet" signal would
   * make it flap.
   */
  async autoCheck(): Promise<ReplicaAutoAction> {
    if (!this.available) return 'none';
    const mode =
      (await this.settings?.string('db.replica_provision').catch(() => null)) ??
      'auto';
    if (mode !== 'auto') return 'none';
    const got = await this.redis
      ?.set(AUTO_LOCK_KEY, '1', 'EX', AUTO_LOCK_TTL_S, 'NX')
      .catch(() => null);
    if (!got) return 'none';
    const cur = await this.probe();
    if (cur.exists) return 'none';
    const cooling = !!(await this.redis
      ?.get(AUTO_COOLDOWN_KEY)
      .catch(() => null));
    const action = decideReplicaAuto({
      mode,
      exists: false,
      coolingDown: cooling,
      cpu: await this.primaryCpu(),
    });
    if (action === 'create') {
      await this.redis
        ?.set(AUTO_COOLDOWN_KEY, '1', 'EX', AUTO_COOLDOWN_S)
        .catch(() => undefined);
      this.log.warn('primary CPU is high for hours: creating the read replica');
      await this.enable('auto');
    }
    return action;
  }

  /** Primary CPU in 15-minute averages over the last 3 hours (oldest first). */
  private async primaryCpu(): Promise<number[]> {
    const end = new Date();
    const r = await this.cwClient().send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/RDS',
        MetricName: 'CPUUtilization',
        Dimensions: [
          { Name: 'DBInstanceIdentifier', Value: this.primaryId ?? '' },
        ],
        StartTime: new Date(end.getTime() - AUTO_UP_POINTS * 15 * 60_000),
        EndTime: end,
        Period: 900,
        Statistics: ['Average'],
      }),
    );
    return (r.Datapoints ?? [])
      .sort(
        (a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0),
      )
      .map((d) => d.Average ?? 0);
  }

  /** Reads RDS (or the Redis copy) and updates what this process serves. */
  async refresh(): Promise<ReplicaStatus> {
    const s = await this.status();
    return s;
  }

  async status(): Promise<ReplicaStatus> {
    if (!this.available) {
      return {
        state: 'unavailable',
        lagSeconds: null,
        instanceClass: null,
        serving: false,
        note: 'Кнопка работает только на AWS после включения в Terraform (db_replica_toggle).',
      };
    }
    let raw = await this.cached();
    if (!raw) {
      raw = await this.probe();
      await this.redis
        ?.set(CACHE_KEY, JSON.stringify(raw), 'EX', CACHE_TTL_S)
        .catch(() => undefined);
    }
    return this.apply(raw);
  }

  private async cached(): Promise<RawProbe | null> {
    try {
      const v = await this.redis?.get(CACHE_KEY);
      return v ? (JSON.parse(v) as RawProbe) : null;
    } catch {
      return null;
    }
  }

  private async probe(): Promise<RawProbe> {
    try {
      const r = await this.rdsClient().send(
        new DescribeDBInstancesCommand({
          DBInstanceIdentifier: this.replicaId,
        }),
      );
      const i = r.DBInstances?.[0];
      if (!i) return { exists: false };
      const lag = i.DBInstanceStatus === 'available' ? await this.lag() : null;
      return {
        exists: true,
        status: i.DBInstanceStatus ?? 'unknown',
        host: i.Endpoint?.Address ?? null,
        cls: i.DBInstanceClass ?? null,
        lag,
      };
    } catch (e) {
      if ((e as { name?: string }).name === 'DBInstanceNotFoundFault') {
        return { exists: false };
      }
      throw e;
    }
  }

  private async lag(): Promise<number | null> {
    const end = new Date();
    const r = await this.cwClient().send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/RDS',
        MetricName: 'ReplicaLag',
        Dimensions: [{ Name: 'DBInstanceIdentifier', Value: this.replicaId }],
        StartTime: new Date(end.getTime() - 5 * 60_000),
        EndTime: end,
        Period: 60,
        Statistics: ['Maximum'],
      }),
    );
    const pts = (r.Datapoints ?? []).sort(
      (a, b) => (b.Timestamp?.getTime() ?? 0) - (a.Timestamp?.getTime() ?? 0),
    );
    return pts.length > 0 ? (pts[0].Maximum ?? null) : null;
  }

  /** Pure decision from an RDS probe; sets what this process serves. */
  private apply(p: RawProbe): ReplicaStatus {
    const s = decideReplica(p, this.serving);
    this.serving = s.serving;
    replicaLive.set(s.serving ? (p.host ?? null) : null);
    return s;
  }

  /** Create the replica (idempotent: an existing one is an error). */
  async enable(by: 'admin-button' | 'auto' = 'admin-button'): Promise<void> {
    if (!this.available) throw new Error('not available');
    const cur = await this.probe();
    if (cur.exists) throw new Error('Копия уже есть или создаётся.');
    const primary = await this.rdsClient().send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: this.primaryId }),
    );
    const p = primary.DBInstances?.[0];
    if (!p) throw new Error('primary database not found');
    const monitoringRole = this.env('OPS_DB_REPLICA_MONITORING_ROLE_ARN');
    await this.rdsClient().send(
      new CreateDBInstanceReadReplicaCommand({
        DBInstanceIdentifier: this.replicaId,
        SourceDBInstanceIdentifier: this.primaryId,
        // Same size as the primary NOW (a replica smaller than the primary
        // would lag and RDS needs max_connections >= the primary's).
        DBInstanceClass: p.DBInstanceClass,
        // Same VPC, subnet group, security groups; the parameter group and the
        // KMS key of the source are inherited by RDS for a same-Region replica.
        VpcSecurityGroupIds: (p.VpcSecurityGroups ?? [])
          .map((g) => g.VpcSecurityGroupId)
          .filter((x): x is string => !!x),
        PubliclyAccessible: false,
        AutoMinorVersionUpgrade: true,
        EnablePerformanceInsights: true,
        PerformanceInsightsRetentionPeriod: 7,
        PerformanceInsightsKMSKeyId: p.PerformanceInsightsKMSKeyId,
        ...(monitoringRole
          ? { MonitoringInterval: 60, MonitoringRoleArn: monitoringRole }
          : {}),
        // Deletion protection stays OFF on purpose: the tap deletes it, and
        // that tap needs a second admin and a fresh 2FA code.
        DeletionProtection: false,
        CopyTagsToSnapshot: true,
        Tags: [
          { Key: 'Role', Value: 'read-replica' },
          { Key: 'ManagedBy', Value: by },
        ],
      }),
    );
    await this.redis?.del(CACHE_KEY).catch(() => undefined);
    this.log.warn(`read replica ${this.replicaId} is being created`);
  }

  /** Delete the replica; the app already reads from the primary by itself. */
  async disable(): Promise<void> {
    if (!this.available) throw new Error('not available');
    const cur = await this.probe();
    if (!cur.exists) throw new Error('Копии нет.');
    replicaLive.set(null);
    this.serving = false;
    await this.rdsClient().send(
      new DeleteDBInstanceCommand({
        DBInstanceIdentifier: this.replicaId,
        SkipFinalSnapshot: true,
        DeleteAutomatedBackups: true,
      }),
    );
    await this.redis?.del(CACHE_KEY).catch(() => undefined);
    this.log.warn(`read replica ${this.replicaId} is being deleted`);
  }
}

const AUTO_CHECK_MS = 10 * 60_000;
const AUTO_LOCK_KEY = 'ops:db-replica:auto-lock';
const AUTO_LOCK_TTL_S = 9 * 60;
const AUTO_COOLDOWN_KEY = 'ops:db-replica:auto-cooldown';
const AUTO_COOLDOWN_S = 24 * 3600;
/** 12 points of 15 minutes = 3 hours. */
export const AUTO_UP_POINTS = 12;
/** Average CPU (%) every one of those points must reach. */
export const AUTO_UP_CPU = 75;

export type ReplicaAutoAction = 'create' | 'none';

/**
 * Pure: create the replica only when the whole last 3 hours were busy (all
 * 12 quarter-hours at or above 75 %, at most one missing), the replica does
 * not exist, and none was created in the last 24 h.
 */
export function decideReplicaAuto(i: {
  mode: string;
  exists: boolean;
  coolingDown: boolean;
  cpu: number[];
}): ReplicaAutoAction {
  if (i.mode !== 'auto' || i.exists || i.coolingDown) return 'none';
  const last = i.cpu.slice(-AUTO_UP_POINTS);
  if (last.length < AUTO_UP_POINTS - 1) return 'none';
  return last.every((v) => v >= AUTO_UP_CPU) ? 'create' : 'none';
}

export interface RawProbe {
  exists: boolean;
  status?: string;
  host?: string | null;
  cls?: string | null;
  lag?: number | null;
}

/** Pure: what the state is, and whether reads should go to the replica. */
export function decideReplica(p: RawProbe, wasServing: boolean): ReplicaStatus {
  const base = {
    lagSeconds: p.lag ?? null,
    instanceClass: p.cls ?? null,
  };
  if (!p.exists) {
    return {
      ...base,
      state: 'off',
      serving: false,
      note: 'Выключено. Чтения идут из основной базы, как раньше.',
    };
  }
  switch (p.status) {
    case 'creating':
    case 'backing-up':
    case 'configuring-enhanced-monitoring':
      return {
        ...base,
        state: 'creating',
        serving: false,
        note: 'Копия создаётся (обычно 15-30 минут). Пока чтения идут из основной базы.',
      };
    case 'deleting':
      return {
        ...base,
        state: 'deleting',
        serving: false,
        note: 'Копия удаляется. Чтения идут из основной базы.',
      };
    case 'available':
    case 'modifying':
    case 'rebooting':
    case 'upgrading':
      break;
    default:
      return {
        ...base,
        state: 'error',
        serving: false,
        note: `Копия в состоянии «${p.status ?? 'неизвестно'}»: чтения идут из основной базы.`,
      };
  }
  if (p.status !== 'available' || p.lag === null || p.lag === undefined) {
    return {
      ...base,
      state: 'creating',
      serving: false,
      note: 'Копия догоняет основную базу. Пока чтения идут из основной базы.',
    };
  }
  const limit = wasServing ? LAG_STOP_S : LAG_START_S;
  if (p.lag > limit) {
    return {
      ...base,
      state: 'lagging',
      serving: false,
      note: `Копия отстаёт на ${Math.round(p.lag)} с: чтения идут из основной базы, вернутся сами.`,
    };
  }
  return {
    ...base,
    state: 'on',
    serving: true,
    note: 'Включено: поиск, профили и ленты читаются из копии.',
  };
}

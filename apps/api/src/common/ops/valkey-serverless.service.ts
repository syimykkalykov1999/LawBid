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
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import {
  DescribeReplicationGroupsCommand,
  ElastiCacheClient,
} from '@aws-sdk/client-elasticache';
import type Redis from 'ioredis';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { opsCredentials } from './ops-credentials';
import {
  compareValkey,
  valkeyNote,
  type ValkeyDayLoad,
  type ValkeyVerdict,
} from './valkey-serverless.logic';
import { AWS_API_REQUEST_HANDLER } from '../http/aws-request-handler';

const LOCK_KEY = 'ops:valkey-serverless:lock';
/** Plain-Russian verdict for «Расходы → Реестр» (row aws.redis_serverless). */
export const VALKEY_SERVERLESS_NOTE_KEY = 'ops:valkey-serverless:note';
const DAY_MS = 86_400_000;

/** Per-day sums out of hourly CloudWatch points (oldest day first; only
 * whole UTC days before `now`, at least 20 hours each). */
export function dayLoads(
  series: Record<'bytes' | 'cmds' | 'net', { t: Date; v: number }[]>,
  now: Date,
): ValkeyDayLoad[] {
  const today = now.toISOString().slice(0, 10);
  const acc = new Map<
    string,
    {
      bytes: number;
      bytesN: number;
      cmds: number;
      net: number;
      hours: Set<number>;
    }
  >();
  const at = (t: Date) => {
    const day = t.toISOString().slice(0, 10);
    if (!acc.has(day)) {
      acc.set(day, { bytes: 0, bytesN: 0, cmds: 0, net: 0, hours: new Set() });
    }
    return acc.get(day)!;
  };
  for (const p of series.bytes) {
    if (!Number.isFinite(p.v)) continue;
    const a = at(p.t);
    a.bytes += p.v;
    a.bytesN += 1;
    a.hours.add(p.t.getTime());
  }
  for (const p of series.cmds) if (Number.isFinite(p.v)) at(p.t).cmds += p.v;
  for (const p of series.net) if (Number.isFinite(p.v)) at(p.t).net += p.v;
  return [...acc.entries()]
    .filter(([day, a]) => day < today && a.hours.size >= 20 && a.bytesN > 0)
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([day, a]) => ({
      day,
      gbStored: a.bytes / a.bytesN / 1e9,
      commandsPerSec: a.cmds / 86_400,
      bytesPerSec: a.net / 86_400,
    }));
}

/**
 * Item 29 (AU5, owner 25.11): every `infra.valkey_serverless_check_hours`
 * (default 6) one process reads the node group's last
 * `infra.valkey_serverless_days` days (hourly CloudWatch: data in memory,
 * commands, network) and prices them on nodes and on Serverless
 * (valkey-serverless.logic.ts). Only a verdict for the owner: the cluster in
 * use is never changed by itself (KNOWN_ERRORS 144: «Авто» never removes
 * what live services use); the move is docs/runbooks/valkey-serverless.md.
 */
@Injectable()
export class ValkeyServerlessService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('ValkeyServerless');
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private cw?: CloudWatchClient;
  private cache?: ElastiCacheClient;

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
  private cwClient(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({
      requestHandler: AWS_API_REQUEST_HANDLER,
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }
  private cacheClient(): ElastiCacheClient {
    return (this.cache ??= new ElastiCacheClient({
      requestHandler: AWS_API_REQUEST_HANDLER,
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }

  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID || process.argv[1]?.includes('worker')) {
      return;
    }
    if (!this.env('OPS_REDIS_GROUP')) return;
    const loop = async () => {
      await this.check().catch((e: Error) =>
        this.log.warn(`valkey serverless pass failed: ${e.message}`),
      );
      this.schedule(loop, await this.checkMs());
    };
    this.schedule(loop, 180_000 + Math.floor(Math.random() * 60_000));
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(fn: () => Promise<void>, ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void fn(), ms);
    this.timer.unref();
  }

  private async num(
    k:
      | 'infra.valkey_serverless_check_hours'
      | 'infra.valkey_serverless_days'
      | 'infra.valkey_serverless_min_saving_pct'
      | 'infra.valkey_serverless_ecpu_factor'
      | 'infra.valkey_serverless_gb_hour_usd'
      | 'infra.valkey_serverless_million_ecpu_usd',
    dflt: number,
  ): Promise<number> {
    const v = await this.settings?.number(k).catch(() => NaN);
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dflt;
  }

  async checkMs(): Promise<number> {
    const h = await this.num('infra.valkey_serverless_check_hours', 6);
    return Math.max(1, h || 6) * 3_600_000;
  }

  /** One pass; null when off, not on AWS or another process holds it. */
  async check(now: Date = new Date()): Promise<ValkeyVerdict | null> {
    const mode = (
      (await this.settings
        ?.string('infra.valkey_serverless_mode')
        .catch(() => 'auto')) ?? 'auto'
    )
      .trim()
      .toLowerCase();
    if (mode === 'off') return null;
    const group = this.env('OPS_REDIS_GROUP');
    if (!group) return null;
    const lockS = Math.max(60, Math.floor((await this.checkMs()) / 1000) - 60);
    const got = this.redis
      ? await this.redis.set(LOCK_KEY, '1', 'EX', lockS, 'NX').catch(() => null)
      : 'OK';
    if (!got) return null;
    const needDays = Math.min(
      30,
      Math.max(
        1,
        Math.floor(await this.num('infra.valkey_serverless_days', 7)),
      ),
    );
    const prices = {
      gbHourUsd: await this.num('infra.valkey_serverless_gb_hour_usd', 0.084),
      millionEcpuUsd: await this.num(
        'infra.valkey_serverless_million_ecpu_usd',
        0.0023,
      ),
      ecpuFactor: await this.num('infra.valkey_serverless_ecpu_factor', 1.5),
    };
    const minSaving = await this.num(
      'infra.valkey_serverless_min_saving_pct',
      10,
    );

    const res = await this.cacheClient().send(
      new DescribeReplicationGroupsCommand({ ReplicationGroupId: group }),
    );
    const g = res.ReplicationGroups?.[0];
    const members = g?.NodeGroups?.[0]?.NodeGroupMembers ?? [];
    const primary =
      (members.find((m) => m.CurrentRole === 'primary') ?? members[0])
        ?.CacheClusterId ?? g?.MemberClusters?.[0];
    const nodes = g?.MemberClusters ?? [];
    if (!g?.CacheNodeType || !primary) return null;

    const days = await this.load(primary, nodes, now, needDays);
    const v = compareValkey(
      days,
      g.CacheNodeType,
      nodes.length,
      prices,
      minSaving,
      needDays,
    );
    const note = valkeyNote(v, needDays);
    if (this.redis) {
      await this.redis
        .set(VALKEY_SERVERLESS_NOTE_KEY, note, 'EX', 3 * 86_400)
        .catch(() => undefined);
    }
    if (v.verdict === 'serverless') {
      this.log.warn(`valkey_serverless_cheaper: ${note}`);
    }
    return v;
  }

  /** Hourly points of the node group over the last `days` + 1 days. */
  private async load(
    primary: string,
    nodes: string[],
    now: Date,
    days: number,
  ): Promise<ValkeyDayLoad[]> {
    const end = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const start = new Date(end.getTime() - (days + 1) * DAY_MS);
    const stat = (
      id: string,
      metric: string,
      node: string,
      s: 'Average' | 'Sum',
    ): MetricDataQuery => ({
      Id: id,
      ReturnData: false,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/ElastiCache',
          MetricName: metric,
          Dimensions: [{ Name: 'CacheClusterId', Value: node }],
        },
        Period: 3600,
        Stat: s,
      },
    });
    const all = nodes.length ? nodes : [primary];
    const q: MetricDataQuery[] = [
      {
        ...stat('bytes', 'BytesUsedForCache', primary, 'Average'),
        ReturnData: true,
      },
    ];
    const cmdIds: string[] = [];
    const netIds: string[] = [];
    all.forEach((n, i) => {
      q.push(stat(`k${i}`, 'KeyBasedCmds', n, 'Sum'));
      q.push(stat(`n${i}`, 'NonKeyTypeCmds', n, 'Sum'));
      q.push(stat(`i${i}`, 'NetworkBytesIn', n, 'Sum'));
      q.push(stat(`o${i}`, 'NetworkBytesOut', n, 'Sum'));
      cmdIds.push(`FILL(k${i}, 0)`, `FILL(n${i}, 0)`);
      netIds.push(`FILL(i${i}, 0)`, `FILL(o${i}, 0)`);
    });
    q.push({ Id: 'cmds', Expression: cmdIds.join(' + '), ReturnData: true });
    q.push({ Id: 'net', Expression: netIds.join(' + '), ReturnData: true });
    const out: Record<'bytes' | 'cmds' | 'net', { t: Date; v: number }[]> = {
      bytes: [],
      cmds: [],
      net: [],
    };
    let token: string | undefined;
    do {
      const r = await this.cwClient().send(
        new GetMetricDataCommand({
          MetricDataQueries: q,
          StartTime: start,
          EndTime: end,
          ScanBy: 'TimestampAscending',
          NextToken: token,
        }),
      );
      for (const x of r.MetricDataResults ?? []) {
        const key = x.Id as 'bytes' | 'cmds' | 'net';
        if (!(key in out)) continue;
        (x.Timestamps ?? []).forEach((t, i) =>
          out[key].push({ t: new Date(t), v: x.Values?.[i] ?? NaN }),
        );
      }
      token = r.NextToken;
    } while (token);
    return dayLoads(out, now);
  }
}

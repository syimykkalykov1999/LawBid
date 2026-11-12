import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  type Dimension,
} from '@aws-sdk/client-cloudwatch';
import {
  DescribeReplicationGroupsCommand,
  ElastiCacheClient,
  ModifyReplicationGroupCommand,
} from '@aws-sdk/client-elasticache';
import {
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand,
  RDSClient,
} from '@aws-sdk/client-rds';
import {
  DB_TIERS,
  REDIS_TIERS,
  dbMaxConnections,
  nextTier,
  prevTier,
} from '../economy/economy.rules';
import { opsCredentials } from './ops-credentials';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  prometheusValue,
  selfHostDbConnections,
  selfHostRedisMemoryPercent,
} from './selfhost-capacity';

export type CapacityTarget = 'db' | 'redis';

export interface CapacityMetrics {
  dbCpuPercent: number | null;
  dbConnections: number | null;
  dbMaxConnections: number | null;
  redisMemoryPercent: number | null;
  /** Owner 2026-11-11: average CPU of the read copies (null = none / unknown). */
  replicaCpuPercent?: number | null;
  /** Owner 2026-11-12: the search engine domain (AWS/ES): CPU (Average) and
   * JVM memory pressure (Maximum); null = no domain / unknown. */
  searchCpuPercent?: number | null;
  searchJvmPercent?: number | null;
}

export interface CapacityInfo {
  dbStorageGb: number | null;
  dbMultiAz: boolean | null;
  dbClass: string | null;
  redisClass: string | null;
}

const WINDOW_MS = 15 * 60_000;

/**
 * Owner 2026-10-16: the database and Redis do not grow by themselves like
 * the containers, so the economy job watches their load (CloudWatch) and
 * the admin gets a one-click «увеличить» that moves them one tier up
 * (RDS ModifyDBInstance / ElastiCache ModifyReplicationGroup). Terraform
 * passes the names in OPS_DB_INSTANCE / OPS_REDIS_GROUP; without them
 * (local Mac, CI, a database outside AWS) every call reports «not on AWS».
 */
@Injectable()
export class AwsCapacityService {
  private cw?: CloudWatchClient;
  private rds?: RDSClient;
  private cache?: ElastiCacheClient;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  private region(): string {
    return this.env('AWS_REGION') ?? this.env('S3_REGION') ?? 'us-east-1';
  }

  get dbInstance(): string | undefined {
    return this.env('OPS_DB_INSTANCE');
  }

  get redisGroup(): string | undefined {
    return this.env('OPS_REDIS_GROUP');
  }

  /** The search engine domain (`<name>-search`, empty while it is off). */
  get searchDomain(): string | undefined {
    return this.env('OPS_SEARCH_DOMAIN');
  }

  get available(): boolean {
    return !!this.dbInstance || !!this.redisGroup;
  }

  /** The load can be read: on AWS (CloudWatch) or, without AWS, from the
   * database and Redis themselves (selfhost-capacity.ts). Resizing stays
   * `available` (RDS / ElastiCache). */
  get readable(): boolean {
    return this.available || !!this.prisma || !!this.redis;
  }

  private cwClient(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }
  private rdsClient(): RDSClient {
    return (this.rds ??= new RDSClient({
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }
  private cacheClient(): ElastiCacheClient {
    return (this.cache ??= new ElastiCacheClient({
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }

  private async dbDescribe(): Promise<{
    dbClass: string | null;
    dbStorageGb: number | null;
    dbMultiAz: boolean | null;
  }> {
    if (!this.dbInstance) {
      return { dbClass: null, dbStorageGb: null, dbMultiAz: null };
    }
    const res = await this.rdsClient().send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: this.dbInstance }),
    );
    const d = res.DBInstances?.[0];
    return {
      dbClass: d?.DBInstanceClass ?? null,
      dbStorageGb: d?.AllocatedStorage ?? null,
      dbMultiAz: d?.MultiAZ ?? null,
    };
  }

  async dbClass(): Promise<string | null> {
    return (await this.dbDescribe()).dbClass;
  }

  /** Newest point the database can be restored to (RDS automated backups
   * + WAL), or null when unknown / not on AWS. Free API call. */
  async latestRestorableTime(): Promise<Date | null> {
    if (!this.dbInstance) return null;
    const res = await this.rdsClient().send(
      new DescribeDBInstancesCommand({ DBInstanceIdentifier: this.dbInstance }),
    );
    return res.DBInstances?.[0]?.LatestRestorableTime ?? null;
  }

  private async redisGroupInfo(): Promise<{
    nodeType: string | null;
    primaryNode: string | null;
  }> {
    if (!this.redisGroup) return { nodeType: null, primaryNode: null };
    const res = await this.cacheClient().send(
      new DescribeReplicationGroupsCommand({
        ReplicationGroupId: this.redisGroup,
      }),
    );
    const g = res.ReplicationGroups?.[0];
    const members = g?.NodeGroups?.[0]?.NodeGroupMembers ?? [];
    const primary =
      members.find((m) => m.CurrentRole === 'primary') ?? members[0];
    return {
      nodeType: g?.CacheNodeType ?? null,
      primaryNode: primary?.CacheClusterId ?? g?.MemberClusters?.[0] ?? null,
    };
  }

  async redisClass(): Promise<string | null> {
    return (await this.redisGroupInfo()).nodeType;
  }

  async info(): Promise<CapacityInfo> {
    const [db, redisClass] = await Promise.all([
      this.dbDescribe().catch(() => ({
        dbClass: null,
        dbStorageGb: null,
        dbMultiAz: null,
      })),
      this.redisClass().catch(() => null),
    ]);
    return { ...db, redisClass };
  }

  /** Average of the last datapoints (5-minute periods over 15 minutes);
   * with `Maximum`, the highest of those points' maxima. */
  private async avg(
    namespace: string,
    metric: string,
    dimensions: Dimension[],
    now: Date,
    stat: 'Average' | 'Maximum' = 'Average',
  ): Promise<number | null> {
    const res = await this.cwClient().send(
      new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metric,
        Dimensions: dimensions,
        StartTime: new Date(now.getTime() - WINDOW_MS),
        EndTime: now,
        Period: 300,
        Statistics: [stat],
      }),
    );
    const points = (res.Datapoints ?? [])
      .filter((p) => typeof p[stat] === 'number' && p.Timestamp)
      .sort((a, b) => a.Timestamp!.getTime() - b.Timestamp!.getTime())
      .slice(-2);
    if (points.length === 0) return null;
    const values = points.map((p) => p[stat] as number);
    if (stat === 'Maximum') return Math.max(...values);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  async metrics(now: Date = new Date()): Promise<CapacityMetrics> {
    const out: CapacityMetrics = {
      dbCpuPercent: null,
      dbConnections: null,
      dbMaxConnections: null,
      redisMemoryPercent: null,
    };
    if (this.dbInstance) {
      const dim = [{ Name: 'DBInstanceIdentifier', Value: this.dbInstance }];
      out.dbCpuPercent = await this.avg('AWS/RDS', 'CPUUtilization', dim, now);
      out.dbConnections = await this.avg(
        'AWS/RDS',
        'DatabaseConnections',
        dim,
        now,
      );
      const cls = await this.dbClass();
      const tier = DB_TIERS.find((t) => t.name === cls);
      out.dbMaxConnections = tier ? dbMaxConnections(tier.memoryGb) : null;
      // The read copies are `<db>-replica-N` (infra/modules/growth), up to 5.
      const copies: number[] = [];
      for (let n = 1; n <= 5; n++) {
        const v = await this.avg(
          'AWS/RDS',
          'CPUUtilization',
          [
            {
              Name: 'DBInstanceIdentifier',
              Value: `${this.dbInstance}-replica-${n}`,
            },
          ],
          now,
        ).catch(() => null);
        if (v == null) break;
        copies.push(v);
      }
      out.replicaCpuPercent = copies.length
        ? copies.reduce((a, b) => a + b, 0) / copies.length
        : null;
    }
    // Owner 2026-11-12 («Авто» by count for the search engine nodes): AWS
    // advises scaling the domain out on CPUUtilization and JVMMemoryPressure
    // (repost.aws knowledge-center opensearch-scale-up). Domain metrics
    // carry the account as ClientId.
    const account = this.env('OPS_AWS_ACCOUNT_ID');
    if (this.searchDomain && account) {
      const dim = [
        { Name: 'DomainName', Value: this.searchDomain },
        { Name: 'ClientId', Value: account },
      ];
      out.searchCpuPercent = await this.avg(
        'AWS/ES',
        'CPUUtilization',
        dim,
        now,
      ).catch(() => null);
      out.searchJvmPercent = await this.avg(
        'AWS/ES',
        'JVMMemoryPressure',
        dim,
        now,
        'Maximum',
      ).catch(() => null);
    }
    // Owner 2026-11-11 («Масштаб» без AWS): what CloudWatch does not cover
    // is read from the services themselves.
    if (!this.dbInstance && this.prisma) {
      const c = await selfHostDbConnections(this.prisma.global());
      out.dbConnections = c.connections;
      out.dbMaxConnections = c.max;
      out.dbCpuPercent = await prometheusValue(
        this.env('OPS_PROMETHEUS_URL'),
        this.env('OPS_DB_CPU_QUERY'),
      );
    }
    if (!this.redisGroup) {
      out.redisMemoryPercent = await selfHostRedisMemoryPercent(this.redis);
    }
    if (this.redisGroup) {
      const { primaryNode } = await this.redisGroupInfo();
      if (primaryNode) {
        out.redisMemoryPercent = await this.avg(
          'AWS/ElastiCache',
          'DatabaseMemoryUsagePercentage',
          [{ Name: 'CacheClusterId', Value: primaryNode }],
          now,
        );
      }
    }
    return out;
  }

  /** Moves the database or Redis to the next bigger tier right away
   * (a short restart / failover). Returns the change, or null when
   * there is no bigger tier or the current class is unknown. */
  async increase(
    target: CapacityTarget,
  ): Promise<{ from: string; to: string } | null> {
    if (target === 'db') {
      if (!this.dbInstance) throw new Error('not on AWS');
      const from = await this.dbClass();
      const next = nextTier(DB_TIERS, from);
      if (!from || !next) return null;
      await this.rdsClient().send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: this.dbInstance,
          DBInstanceClass: next.name,
          ApplyImmediately: true,
        }),
      );
      return { from, to: next.name };
    }
    if (!this.redisGroup) throw new Error('not on AWS');
    const from = await this.redisClass();
    const next = nextTier(REDIS_TIERS, from);
    if (!from || !next) return null;
    await this.cacheClient().send(
      new ModifyReplicationGroupCommand({
        ReplicationGroupId: this.redisGroup,
        CacheNodeType: next.name,
        ApplyImmediately: true,
      }),
    );
    return { from, to: next.name };
  }

  /** One tier down (admin button, after the load check in
   * EconomyService.decrease). Same RDS / ElastiCache calls as [increase]. */
  async decrease(
    target: CapacityTarget,
  ): Promise<{ from: string; to: string } | null> {
    if (target === 'db') {
      if (!this.dbInstance) throw new Error('not on AWS');
      const from = await this.dbClass();
      const prev = prevTier(DB_TIERS, from);
      if (!from || !prev) return null;
      await this.rdsClient().send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: this.dbInstance,
          DBInstanceClass: prev.name,
          ApplyImmediately: true,
        }),
      );
      return { from, to: prev.name };
    }
    if (!this.redisGroup) throw new Error('not on AWS');
    const from = await this.redisClass();
    const prev = prevTier(REDIS_TIERS, from);
    if (!from || !prev) return null;
    await this.cacheClient().send(
      new ModifyReplicationGroupCommand({
        ReplicationGroupId: this.redisGroup,
        CacheNodeType: prev.name,
        ApplyImmediately: true,
      }),
    );
    return { from, to: prev.name };
  }
}

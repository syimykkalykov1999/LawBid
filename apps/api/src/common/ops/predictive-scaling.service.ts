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
  ApplicationAutoScalingClient,
  DescribeScalingPoliciesCommand,
  GetPredictiveScalingForecastCommand,
  PutScalingPolicyCommand,
  type PredictiveScalingMetricDataQuery,
  type PredictiveScalingPolicyConfiguration,
} from '@aws-sdk/client-application-auto-scaling';
import {
  CloudWatchClient,
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import type Redis from 'ioredis';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { infraWritesOff } from './infra-writes';
import { opsCredentials } from './ops-credentials';
import {
  dailyErrors,
  decidePredictive,
  predictiveNote,
  predictiveSetting,
  type PredictiveDecision,
  type PredictiveMode,
} from './predictive-scaling.logic';

const LOCK_KEY = 'ops:predictive:lock';
/** Plain-Russian status for «Расходы → Реестр» (row aws.ecs_predictive). */
export const PREDICTIVE_NOTE_KEY = 'ops:predictive:note';
const DAY_MS = 86_400_000;
/** AWS: StartTime..EndTime of GetPredictiveScalingForecast is at most 30 days. */
const MAX_DAYS = 29;

interface PolicyRef {
  name: string;
  resource_id: string;
  dimension: string;
}

/** App Auto Scaling's query shape -> CloudWatch's, with the hourly period
 * AWS uses for the load ("the load metric specification uses hourly
 * metrics", ECS guide, custom metrics). */
export function toCloudWatchQueries(
  q: PredictiveScalingMetricDataQuery[],
): MetricDataQuery[] {
  return q.map((x) => ({
    Id: x.Id,
    Label: x.Label,
    ReturnData: x.ReturnData ?? true,
    ...(x.Expression ? { Expression: x.Expression } : {}),
    ...(x.MetricStat
      ? {
          MetricStat: {
            Metric: {
              Namespace: x.MetricStat.Metric?.Namespace,
              MetricName: x.MetricStat.Metric?.MetricName,
              Dimensions: x.MetricStat.Metric?.Dimensions?.map((d) => ({
                Name: d.Name,
                Value: d.Value,
              })),
            },
            Stat: x.MetricStat.Stat,
            Period: 3600,
            ...(x.MetricStat.Unit ? { Unit: x.MetricStat.Unit as never } : {}),
          },
        }
      : {}),
  }));
}

/**
 * Item 27 (AU1, owner 25.11): the admin's Выкл / Прогноз / Вкл / Авто for the
 * api predictive scaling policy (modules/ecs api_predictive, created in
 * ForecastOnly). Every `infra.predictive_check_minutes` (default 60: the
 * forecast is hourly) one task compares the forecast of the last days with
 * the requests that really came (WAPE per day, predictive-scaling.logic.ts)
 * and sets the policy's Mode with PutScalingPolicy, the rest of the live
 * configuration kept. Runs where the infrastructure may be changed (the
 * api-admin service; not the worker, not a split public api task).
 */
@Injectable()
export class PredictiveScalingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PredictiveScaling');
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private scaling?: ApplicationAutoScalingClient;
  private cw?: CloudWatchClient;

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
  private scalingClient(): ApplicationAutoScalingClient {
    return (this.scaling ??= new ApplicationAutoScalingClient({
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }
  private cwClient(): CloudWatchClient {
    return (this.cw ??= new CloudWatchClient({
      region: this.region(),
      credentials: opsCredentials((n) => this.env(n), this.region()),
    }));
  }

  policies(): Record<string, PolicyRef> {
    try {
      const raw = this.env('OPS_ECS_PREDICTIVE_POLICIES');
      const j = raw ? (JSON.parse(raw) as Record<string, PolicyRef>) : {};
      return j && typeof j === 'object' ? j : {};
    } catch {
      return {};
    }
  }

  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID || process.argv[1]?.includes('worker')) {
      return;
    }
    if (infraWritesOff()) return;
    if (Object.keys(this.policies()).length === 0) return;
    const loop = async () => {
      await this.check().catch((e: Error) =>
        this.log.warn(`predictive pass failed: ${e.message}`),
      );
      this.schedule(loop, await this.checkMs());
    };
    this.schedule(loop, 120_000 + Math.floor(Math.random() * 60_000));
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
      | 'infra.predictive_check_minutes'
      | 'infra.predictive_max_error_pct'
      | 'infra.predictive_good_days',
  ): Promise<number> {
    return (await this.settings?.number(k).catch(() => 0)) ?? 0;
  }

  async checkMs(): Promise<number> {
    const m = await this.num('infra.predictive_check_minutes');
    return Math.max(1, m > 0 ? m : 60) * 60_000;
  }

  /** One pass over the predictive policies; returns what it decided. */
  async check(
    now: Date = new Date(),
  ): Promise<
    Record<string, PredictiveDecision & { changed: boolean; note: string }>
  > {
    const lockS = Math.max(30, Math.floor((await this.checkMs()) / 1000) - 60);
    const got = this.redis
      ? await this.redis.set(LOCK_KEY, '1', 'EX', lockS, 'NX').catch(() => null)
      : 'OK';
    if (!got) return {};
    const setting = predictiveSetting(
      await this.settings
        ?.string('infra.predictive_scaling_mode')
        .catch(() => 'forecast'),
    );
    const maxErr = (await this.num('infra.predictive_max_error_pct')) || 20;
    const goodDays = Math.min(
      MAX_DAYS,
      Math.max(1, (await this.num('infra.predictive_good_days')) || 14),
    );
    const out: Record<
      string,
      PredictiveDecision & { changed: boolean; note: string }
    > = {};
    const notes: string[] = [];
    for (const [key, p] of Object.entries(this.policies())) {
      const res = await this.scalingClient().send(
        new DescribeScalingPoliciesCommand({
          ServiceNamespace: 'ecs',
          ResourceId: p.resource_id,
          PolicyNames: [p.name],
        }),
      );
      const live =
        res.ScalingPolicies?.[0]?.PredictiveScalingPolicyConfiguration;
      if (!live) continue;
      const days = await this.measure(p, live, now, goodDays).catch(
        (e: Error) => {
          this.log.warn(`predictive ${key}: measuring failed: ${e.message}`);
          return [];
        },
      );
      const liveMode = live.Mode ?? 'ForecastOnly';
      const d = decidePredictive(
        setting,
        days,
        maxErr,
        goodDays,
        liveMode,
        now,
      );
      let changed = false;
      if (d.mode !== liveMode) {
        await this.apply(p, live, d.mode);
        changed = true;
        this.log.log(
          `predictive ${key}: ${liveMode} -> ${d.mode} (${d.reason})`,
        );
      }
      const note = predictiveNote(d, days, maxErr, goodDays);
      notes.push(note);
      out[key] = { ...d, changed, note };
    }
    if (notes.length && this.redis) {
      await this.redis
        .set(PREDICTIVE_NOTE_KEY, notes.join(' '), 'EX', 3 * 86_400)
        .catch(() => undefined);
    }
    return out;
  }

  /** Daily forecast error of the last `goodDays` (+1) whole days. */
  async measure(
    p: PolicyRef,
    live: PredictiveScalingPolicyConfiguration,
    now: Date,
    goodDays: number,
  ) {
    const queries =
      live.MetricSpecifications?.[0]?.CustomizedLoadMetricSpecification
        ?.MetricDataQueries;
    // A predefined pair has no queries we can repeat: no measurement, so
    // «Авто» never trusts it (stays ForecastOnly).
    if (!queries?.length) return [];
    const end = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    const start = new Date(end.getTime() - (goodDays + 1) * DAY_MS);
    const fc = await this.scalingClient().send(
      new GetPredictiveScalingForecastCommand({
        ServiceNamespace: 'ecs',
        ResourceId: p.resource_id,
        ScalableDimension: p.dimension as never,
        PolicyName: p.name,
        StartTime: start,
        EndTime: end,
      }),
    );
    const lf = fc.LoadForecast?.[0];
    const forecast = (lf?.Timestamps ?? []).map((t, i) => ({
      t: new Date(t),
      v: lf?.Values?.[i] ?? NaN,
    }));
    const actual: { t: Date; v: number }[] = [];
    let token: string | undefined;
    do {
      const r = await this.cwClient().send(
        new GetMetricDataCommand({
          MetricDataQueries: toCloudWatchQueries(queries),
          StartTime: start,
          EndTime: end,
          ScanBy: 'TimestampAscending',
          NextToken: token,
        }),
      );
      const ret = (r.MetricDataResults ?? []).find(
        (x) => queries.find((q) => q.Id === x.Id)?.ReturnData !== false,
      );
      (ret?.Timestamps ?? []).forEach((t, i) =>
        actual.push({ t: new Date(t), v: ret?.Values?.[i] ?? NaN }),
      );
      token = r.NextToken;
    } while (token);
    return dailyErrors(forecast, actual, now);
  }

  private async apply(
    p: PolicyRef,
    live: PredictiveScalingPolicyConfiguration,
    mode: PredictiveMode,
  ): Promise<void> {
    await this.scalingClient().send(
      new PutScalingPolicyCommand({
        PolicyName: p.name,
        ServiceNamespace: 'ecs',
        ResourceId: p.resource_id,
        ScalableDimension: p.dimension as never,
        PolicyType: 'PredictiveScaling',
        PredictiveScalingPolicyConfiguration: { ...live, Mode: mode },
      }),
    );
  }
}

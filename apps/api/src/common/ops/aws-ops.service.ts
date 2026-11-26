import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
  DescribeScheduledActionsCommand,
  PutScalingPolicyCommand,
  PutScheduledActionCommand,
  RegisterScalableTargetCommand,
  type TargetTrackingScalingPolicyConfiguration,
} from '@aws-sdk/client-application-auto-scaling';
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets';
import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import { taskPriceFactor } from '../economy/economy.rules';
import { ECS_CAPACITY_KINDS, spotSplit, splitKinds } from './autoscale-tuning';
import type { CostSnapshot } from './ops.constants';
import { OpsStateService } from './ops-state.service';
import { opsCredentials } from './ops-credentials';
import { AWS_API_REQUEST_HANDLER } from '../http/aws-request-handler';

export type TaskKind = 'api' | 'worker';

/** Owner 2026-11-12 (row 67): the other services with an owner's ceiling
 * (`scale.max_tasks.<kind>`), named by OPS_*_SERVICE (empty = not here). */
export type OtherKind = 'api_admin' | 'admin' | 'pgbouncer';
export type ServiceKind = TaskKind | OtherKind;

/** One ECS service now (owner 15.11, «Сейчас» on «Масштаб»). `spot` null =
 * the service does not say (no strategy and no launch type). Owner 15.11
 * («сделай настраиваемыми»): the strategy numbers (null = launch type, no
 * strategy) and the autoscaling floor / ceiling (null = not read). */
export interface ServiceNow {
  kind: ServiceKind;
  running: number;
  desired: number;
  spot: boolean | null;
  base?: number | null;
  fargateWeight?: number | null;
  spotWeight?: number | null;
  min?: number | null;
  max?: number | null;
}

/** Result of applying the admin's floors (owner 15.11). */
export interface MinTasksApplied {
  changed: string[];
  missing: string[];
  /** Morning-up scheduled actions moved to the admin's floor. */
  morning: string[];
  /** Calls AWS refused (e.g. a right the owner's apply has not added yet). */
  failed: string[];
}

/** Pure: one DescribeServices entry as ServiceNow. Spot = the capacity
 * provider strategy gives FARGATE_SPOT a weight; a plain launch type = no. */
export function serviceNow(
  kind: ServiceKind,
  sv: {
    runningCount?: number;
    desiredCount?: number;
    launchType?: string;
    capacityProviderStrategy?: {
      capacityProvider?: string;
      weight?: number;
      base?: number;
    }[];
  },
): ServiceNow {
  const strategy = sv.capacityProviderStrategy ?? [];
  const item = (p: string) => strategy.find((c) => c.capacityProvider === p);
  const fargate = item('FARGATE');
  const spotItem = item('FARGATE_SPOT');
  return {
    kind,
    running: sv.runningCount ?? 0,
    desired: sv.desiredCount ?? 0,
    base: strategy.length ? (fargate?.base ?? 0) + (spotItem?.base ?? 0) : null,
    fargateWeight: strategy.length ? (fargate?.weight ?? 0) : null,
    spotWeight: strategy.length ? (spotItem?.weight ?? 0) : null,
    spot: strategy.length
      ? strategy.some(
          (c) => c.capacityProvider === 'FARGATE_SPOT' && (c.weight ?? 0) > 0,
        )
      : sv.launchType
        ? false
        : null,
  };
}
export const OTHER_SERVICE_ENV: Readonly<Record<OtherKind, string>> = {
  api_admin: 'OPS_API_ADMIN_SERVICE',
  admin: 'OPS_ADMIN_SERVICE',
  pgbouncer: 'OPS_POOLER_SERVICE',
};

/**
 * Owner 2026-10-05: the few infrastructure actions an owner may need,
 * done with the task role (infra/modules/stack grants exactly these):
 * restart the worker, cap autoscaling at the minimum or give it back,
 * read this month's AWS spend from the budget. Terraform passes the
 * names in OPS_* env vars; without them (local Mac, CI) every action
 * reports `available: false` and the admin says «только на AWS».
 */
@Injectable()
export class AwsOpsService {
  private ecs?: ECSClient;
  private scaling?: ApplicationAutoScalingClient;
  private budgets?: BudgetsClient;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly state?: OpsStateService,
  ) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  /** S4-1: the separate ops role when OPS_ROLE_ARN is set, else the default chain. */
  private creds(region: string) {
    return opsCredentials((n) => this.env(n), region);
  }

  get cluster(): string | undefined {
    return this.env('OPS_ECS_CLUSTER');
  }

  /** ECS actions (restart, scale) are possible here. */
  get available(): boolean {
    return !!this.cluster && !!this.env('OPS_WORKER_SERVICE');
  }

  get budgetAvailable(): boolean {
    return !!this.env('OPS_BUDGET_NAME') && !!this.env('OPS_AWS_ACCOUNT_ID');
  }

  private region(): string {
    return this.env('AWS_REGION') ?? this.env('S3_REGION') ?? 'us-east-1';
  }

  private ecsClient(): ECSClient {
    return (this.ecs ??= new ECSClient({
      requestHandler: AWS_API_REQUEST_HANDLER,
      region: this.region(),
      credentials: this.creds(this.region()),
    }));
  }

  private scalingClient(): ApplicationAutoScalingClient {
    return (this.scaling ??= new ApplicationAutoScalingClient({
      requestHandler: AWS_API_REQUEST_HANDLER,
      region: this.region(),
      credentials: this.creds(this.region()),
    }));
  }

  /** New tasks replace the running worker (the old one finishes its job). */
  async restartWorker(): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    await this.ecsClient().send(
      new UpdateServiceCommand({
        cluster: this.cluster,
        service: this.env('OPS_WORKER_SERVICE'),
        forceNewDeployment: true,
      }),
    );
  }

  private services(): { service: string; normalMax: number }[] {
    const out: { service: string; normalMax: number }[] = [];
    const api = this.env('OPS_API_SERVICE');
    const worker = this.env('OPS_WORKER_SERVICE');
    if (api) {
      out.push({ service: api, normalMax: this.num('OPS_API_MAX_TASKS', 4) });
    }
    if (worker) {
      out.push({
        service: worker,
        normalMax: this.num('OPS_WORKER_MAX_TASKS', 2),
      });
    }
    return out;
  }

  private num(name: string, fallback: number): number {
    const n = Number(this.env(name));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  get minTasks(): number {
    return this.num('OPS_MIN_TASKS', 1);
  }

  /** The Terraform start ceiling of a service (OPS_*_MAX_TASKS). Since
   * 2026-11-12 (row 67) the cap is the owner's admin setting
   * `scale.max_tasks.<kind>` (no upper bound), passed by the economy job;
   * this number is only the fallback when no setting can be read. */
  hardCap(kind: TaskKind): number {
    return kind === 'api'
      ? this.num('OPS_API_MAX_TASKS', 4)
      : this.num('OPS_WORKER_MAX_TASKS', 2);
  }

  /** Monthly cost of one running task. Terraform passes the x86 on-demand
   * price of the task size (the defaults match the launch sizes); the
   * architecture (ARM64 ≈ ×0.8) and Spot (blended ≈ ×0.45) are applied
   * here (S9-7), so the ceiling math sees what the bill really holds. */
  taskUsd(kind: TaskKind): number {
    const base =
      kind === 'api'
        ? this.num('OPS_API_TASK_USD', 18)
        : this.num('OPS_WORKER_TASK_USD', 28);
    const spot =
      this.env(kind === 'api' ? 'OPS_API_SPOT' : 'OPS_WORKER_SPOT') === 'on';
    const factor = taskPriceFactor({
      arch: this.env('OPS_CPU_ARCH'),
      spot,
      armFactor: this.num('OPS_ARM_PRICE_FACTOR', 0.8),
      spotFactor: this.num('OPS_SPOT_PRICE_FACTOR', 0.45),
    });
    return Math.round(base * factor * 100) / 100;
  }

  /**
   * 'min': autoscaling may not add tasks (bill stays at the floor);
   * 'normal': the ceiling the economy job last applied (else the
   * Terraform maximum). The floor itself is never written here (G1,
   * 2026-11-08): it belongs to Terraform (`api_min_tasks`) and its night
   * schedule, so the app keeps answering either way.
   */
  async setScale(mode: 'min' | 'normal'): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    const applied = mode === 'normal' ? await this.state?.ceiling() : null;
    for (const s of this.services()) {
      const kind: TaskKind =
        s.service === this.env('OPS_API_SERVICE') ? 'api' : 'worker';
      // Owner 2026-11-12: the owner's ceiling may be above Terraform's.
      const normal = applied?.[kind] ?? s.normalMax;
      // 'min' = the ceiling drops to whatever the floor is right now.
      await this.registerMax(s.service, mode === 'min' ? 0 : normal);
    }
  }

  /** Sets the autoscaling ceilings (never below the floor). Owner
   * 2026-11-12 (row 67): no upper bound here, only the owner's number
   * (`scale.max_tasks.*`, applied by the caller) limits it. */
  async setCeilings(c: Record<TaskKind, number>): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    const api = this.env('OPS_API_SERVICE');
    const worker = this.env('OPS_WORKER_SERVICE');
    const pairs: [string | undefined, TaskKind][] = [
      [api, 'api'],
      [worker, 'worker'],
    ];
    for (const [service, kind] of pairs) {
      if (!service) continue;
      await this.registerMax(service, c[kind]);
    }
  }

  /**
   * Owner 2026-11-12 (row 67): the owner's ceiling of api-admin, admin and
   * the pooler. Only a target Terraform already registered is changed (its
   * floor is never written); a service missing from this stack is skipped.
   * Returns the ceiling now in AWS per kind.
   */
  async setOtherCeilings(
    c: Partial<Record<OtherKind, number>>,
  ): Promise<Partial<Record<OtherKind, number>>> {
    if (!this.available) throw new Error('not on AWS');
    const out: Partial<Record<OtherKind, number>> = {};
    for (const [kind, wanted] of Object.entries(c) as [OtherKind, number][]) {
      const service = this.env(OTHER_SERVICE_ENV[kind]);
      if (!service || !Number.isFinite(wanted) || wanted < 1) continue;
      const max = await this.registerMax(service, Math.floor(wanted), false);
      if (max !== null) out[kind] = max;
    }
    return out;
  }

  /**
   * G1 (automation audit 2026-11-08): changes ONLY the ceiling. Before,
   * every 5-minute economy tick also wrote MinCapacity = OPS_MIN_TASKS,
   * which undid the daytime floor (`api_min_tasks`) and the night / morning
   * scheduled actions within 5 minutes. Application Auto Scaling keeps the
   * current MinCapacity when the field is left out of
   * RegisterScalableTarget for a target that is already registered; the
   * ceiling is kept at or above the live floor (the call fails otherwise).
   * A target that is not registered yet gets both, floor = OPS_MIN_TASKS.
   */
  private async registerMax(
    service: string,
    wanted: number,
    registerNew = true,
  ): Promise<number | null> {
    const resourceId = `service/${this.cluster}/${service}`;
    const res = await this.scalingClient().send(
      new DescribeScalableTargetsCommand({
        ServiceNamespace: 'ecs',
        ScalableDimension: 'ecs:service:DesiredCount',
        ResourceIds: [resourceId],
      }),
    );
    const live = (res.ScalableTargets ?? []).find(
      (t) => t.ResourceId === resourceId,
    );
    const floor =
      typeof live?.MinCapacity === 'number' ? live.MinCapacity : undefined;
    if (floor === undefined && !registerNew) return null;
    const max = Math.max(floor ?? this.minTasks, wanted);
    if (floor !== undefined && live?.MaxCapacity === max) return max;
    await this.scalingClient().send(
      new RegisterScalableTargetCommand({
        ServiceNamespace: 'ecs',
        ScalableDimension: 'ecs:service:DesiredCount',
        ResourceId: resourceId,
        ...(floor === undefined ? { MinCapacity: this.minTasks } : {}),
        MaxCapacity: max,
      }),
    );
    return max;
  }

  /** The ECS service name of a kind here (OPS_*_SERVICE; undefined = not in
   * this stack). */
  serviceName(kind: ServiceKind): string | undefined {
    if (kind === 'api') return this.env('OPS_API_SERVICE');
    if (kind === 'worker') return this.env('OPS_WORKER_SERVICE');
    return this.env(OTHER_SERVICE_ENV[kind]);
  }

  /**
   * Owner 15.11 (Spot split from the admin): `{<service name>: {base,
   * fargate, spot}}` of the services whose split the admin set. The API does
   * not change the strategy itself: modules/spot-fallback is the one writer
   * of capacityProviderStrategy (it already holds ecs:UpdateService on every
   * Spot service and rolls a deployment), it reads this from
   * ops/scale-controls.json and its tick brings each service to it. Two
   * writers would undo each other ("weights differ" restore).
   */
  spotSplits(
    tuning: Record<string, number>,
  ): Record<string, { base: number; fargate: number; spot: number }> {
    const out: Record<string, { base: number; fargate: number; spot: number }> =
      {};
    for (const kind of splitKinds(tuning)) {
      const name = this.serviceName(kind);
      if (name) out[name] = spotSplit(tuning, kind);
    }
    return out;
  }

  /**
   * Owner 15.11 («сделай настраиваемыми»): the admin's floor per service
   * (`<kind>.min_tasks`, SSM `ecs-scaling/tuning`), applied on save — never
   * on the 5-minute tick, which would undo the night schedule (G1,
   * 2026-11-08). RegisterScalableTarget with MinCapacity (and MaxCapacity
   * raised to it when the live ceiling is lower: AWS keeps a parameter that
   * is left out). A morning-up scheduled action (modules/ecs quiet hours)
   * would put Terraform's floor back every morning, so its MinCapacity
   * follows too (PutScheduledAction, schedule copied). A service that is not
   * registered = `missing`; a refused call = `failed`, the rest go on.
   */
  async applyMinTasks(
    tuning: Record<string, number>,
  ): Promise<MinTasksApplied> {
    const out: MinTasksApplied = {
      changed: [],
      missing: [],
      morning: [],
      failed: [],
    };
    if (!this.available) return out;
    for (const kind of ECS_CAPACITY_KINDS) {
      const min = tuning[`${kind}.min_tasks`];
      const service = this.serviceName(kind);
      if (typeof min !== 'number' || !service) continue;
      const resourceId = `service/${this.cluster}/${service}`;
      try {
        const res = await this.scalingClient().send(
          new DescribeScalableTargetsCommand({
            ServiceNamespace: 'ecs',
            ScalableDimension: 'ecs:service:DesiredCount',
            ResourceIds: [resourceId],
          }),
        );
        const live = (res.ScalableTargets ?? []).find(
          (t) => t.ResourceId === resourceId,
        );
        if (!live) {
          out.missing.push(kind);
          continue;
        }
        if (live.MinCapacity !== min) {
          await this.scalingClient().send(
            new RegisterScalableTargetCommand({
              ServiceNamespace: 'ecs',
              ScalableDimension: 'ecs:service:DesiredCount',
              ResourceId: resourceId,
              MinCapacity: min,
              ...(typeof live.MaxCapacity === 'number' && live.MaxCapacity < min
                ? { MaxCapacity: min }
                : {}),
            }),
          );
          out.changed.push(kind);
        }
      } catch {
        out.failed.push(kind);
        continue;
      }
      try {
        const sched = await this.scalingClient().send(
          new DescribeScheduledActionsCommand({
            ServiceNamespace: 'ecs',
            ScalableDimension: 'ecs:service:DesiredCount',
            ResourceId: resourceId,
          }),
        );
        for (const a of sched.ScheduledActions ?? []) {
          if (!a.ScheduledActionName?.endsWith('-morning-up')) continue;
          if (a.ScalableTargetAction?.MinCapacity === min) continue;
          await this.scalingClient().send(
            new PutScheduledActionCommand({
              ServiceNamespace: 'ecs',
              ScalableDimension: 'ecs:service:DesiredCount',
              ResourceId: resourceId,
              ScheduledActionName: a.ScheduledActionName,
              Schedule: a.Schedule,
              Timezone: a.Timezone,
              // "If you don't specify start and end times, the old values
              // are deleted" (PutScheduledAction): keep them.
              StartTime: a.StartTime,
              EndTime: a.EndTime,
              ScalableTargetAction: {
                ...a.ScalableTargetAction,
                MinCapacity: min,
              },
            }),
          );
          out.morning.push(kind);
        }
      } catch {
        out.failed.push(`${kind}.morning`);
      }
    }
    return out;
  }

  /**
   * Owner 14.11: the admin's ECS target-tracking numbers
   * (`<policy>.target|in_s|out_s`, SSM `ecs-scaling/tuning`). Each policy of
   * OPS_ECS_SCALING_POLICIES (Terraform: name, resource, defaults) gets the
   * admin value or its default; the metric and everything else is kept from
   * the live policy (PutScalingPolicy replaces the whole configuration).
   * Equal = no call; a policy that does not exist = `missing`.
   */
  async applyScaling(
    tuning: Record<string, number>,
  ): Promise<{ changed: string[]; missing: string[] }> {
    const raw = this.env('OPS_ECS_SCALING_POLICIES');
    let refs: Record<
      string,
      {
        name: string;
        resource_id: string;
        dimension: string;
        target: number;
        in_s: number;
        out_s: number;
      }
    > = {};
    try {
      refs = raw ? (JSON.parse(raw) as typeof refs) : {};
    } catch {
      refs = {};
    }
    const changed: string[] = [];
    const missing: string[] = [];
    for (const [key, p] of Object.entries(refs)) {
      const res = await this.scalingClient().send(
        new DescribeScalingPoliciesCommand({
          ServiceNamespace: 'ecs',
          ResourceId: p.resource_id,
          PolicyNames: [p.name],
        }),
      );
      const live =
        res.ScalingPolicies?.[0]?.TargetTrackingScalingPolicyConfiguration;
      if (!live) {
        missing.push(key);
        continue;
      }
      const want: TargetTrackingScalingPolicyConfiguration = {
        ...live,
        TargetValue: tuning[`${key}.target`] ?? p.target,
        ScaleInCooldown: tuning[`${key}.in_s`] ?? p.in_s,
        ScaleOutCooldown: tuning[`${key}.out_s`] ?? p.out_s,
      };
      if (
        want.TargetValue === live.TargetValue &&
        want.ScaleInCooldown === live.ScaleInCooldown &&
        want.ScaleOutCooldown === live.ScaleOutCooldown
      ) {
        continue;
      }
      await this.scalingClient().send(
        new PutScalingPolicyCommand({
          PolicyName: p.name,
          ServiceNamespace: 'ecs',
          ResourceId: p.resource_id,
          ScalableDimension: p.dimension as never,
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: want,
        }),
      );
      changed.push(key);
    }
    // Item 27 (AU1): the api predictive policy forecasts on the same signal
    // as `api_requests` (requests per healthy target), so its target is the
    // admin's `api_requests.target` too; Mode and the rest stay as they are
    // (PredictiveScalingService owns Mode).
    const want = tuning['api_requests.target'] ?? refs.api_requests?.target;
    if (typeof want === 'number') {
      const r = await this.syncPredictiveTarget(want);
      if (r === 'changed') changed.push('api_predictive');
      if (r === 'missing') missing.push('api_predictive');
    }
    return { changed, missing };
  }

  /** Item 27: TargetValue of the api predictive policy = `target`. */
  async syncPredictiveTarget(
    target: number,
  ): Promise<'changed' | 'same' | 'missing' | 'off'> {
    let refs: Record<
      string,
      { name: string; resource_id: string; dimension: string }
    > = {};
    try {
      const raw = this.env('OPS_ECS_PREDICTIVE_POLICIES');
      refs = raw ? (JSON.parse(raw) as typeof refs) : {};
    } catch {
      refs = {};
    }
    const p = refs.api;
    if (!p) return 'off';
    const res = await this.scalingClient().send(
      new DescribeScalingPoliciesCommand({
        ServiceNamespace: 'ecs',
        ResourceId: p.resource_id,
        PolicyNames: [p.name],
      }),
    );
    const live = res.ScalingPolicies?.[0]?.PredictiveScalingPolicyConfiguration;
    if (!live?.MetricSpecifications?.length) return 'missing';
    if (live.MetricSpecifications.every((m) => m.TargetValue === target)) {
      return 'same';
    }
    await this.scalingClient().send(
      new PutScalingPolicyCommand({
        PolicyName: p.name,
        ServiceNamespace: 'ecs',
        ResourceId: p.resource_id,
        ScalableDimension: p.dimension as never,
        PolicyType: 'PredictiveScaling',
        PredictiveScalingPolicyConfiguration: {
          ...live,
          MetricSpecifications: live.MetricSpecifications.map((m) => ({
            ...m,
            TargetValue: target,
          })),
        },
      }),
    );
    return 'changed';
  }

  /** Tasks running / wanted now per service (null off AWS). Owner 15.11
   * («Сейчас» on «Масштаб»): `services` also lists the other services
   * (OPS_*_SERVICE) and whether each runs on Spot. The other three are a
   * second call that may fail on its own (the task role may read only api
   * and worker until the read grant is applied): then they are left out and
   * the api / worker counts stay as before. */
  async taskCounts(): Promise<
    | (Record<TaskKind, { running: number; desired: number }> & {
        services: ServiceNow[];
      })
    | null
  > {
    if (!this.available) return null;
    const api = this.env('OPS_API_SERVICE');
    const worker = this.env('OPS_WORKER_SERVICE');
    const names = [api, worker].filter((x): x is string => !!x);
    const res = await this.ecsClient().send(
      new DescribeServicesCommand({ cluster: this.cluster, services: names }),
    );
    const find = (name?: string) => {
      const sv = (res.services ?? []).find((x) => x.serviceName === name);
      return { running: sv?.runningCount ?? 0, desired: sv?.desiredCount ?? 0 };
    };
    const others: [ServiceKind, string][] = [];
    for (const kind of ['api_admin', 'admin', 'pgbouncer'] as const) {
      const name = this.env(OTHER_SERVICE_ENV[kind]);
      if (name) others.push([kind, name]);
    }
    const more = others.length
      ? await this.ecsClient()
          .send(
            new DescribeServicesCommand({
              cluster: this.cluster,
              services: others.map(([, n]) => n),
            }),
          )
          .catch(() => null)
      : null;
    const named: [ServiceKind, string][] = [
      ...(api ? [['api', api] as [ServiceKind, string]] : []),
      ...(worker ? [['worker', worker] as [ServiceKind, string]] : []),
      ...others,
    ];
    const all = [...(res.services ?? []), ...(more?.services ?? [])];
    // Owner 15.11: the floor / ceiling next to the counts (read only; a
    // refused read leaves them out).
    const targets = named.length
      ? await this.scalingClient()
          .send(
            new DescribeScalableTargetsCommand({
              ServiceNamespace: 'ecs',
              ScalableDimension: 'ecs:service:DesiredCount',
              ResourceIds: named.map(([, n]) => `service/${this.cluster}/${n}`),
            }),
          )
          .catch(() => null)
      : null;
    const services: ServiceNow[] = [];
    for (const [kind, name] of named) {
      const sv = all.find((x) => x.serviceName === name);
      if (!sv) continue;
      const t = targets?.ScalableTargets?.find(
        (x) => x.ResourceId === `service/${this.cluster}/${name}`,
      );
      services.push({
        ...serviceNow(kind, sv),
        min: t?.MinCapacity ?? null,
        max: t?.MaxCapacity ?? null,
      });
    }
    return { api: find(api), worker: find(worker), services };
  }

  /** Current autoscaling ceiling per kind (null off AWS). */
  async ceilingsNow(): Promise<Record<TaskKind, number> | null> {
    const byName = await this.currentMax();
    if (!byName) return null;
    const api = this.env('OPS_API_SERVICE');
    const worker = this.env('OPS_WORKER_SERVICE');
    return {
      api: (api && byName[api]) || 0,
      worker: (worker && byName[worker]) || 0,
    };
  }

  /** Current autoscaling ceiling per service (null off AWS). */
  async currentMax(): Promise<Record<string, number> | null> {
    if (!this.available) return null;
    const res = await this.scalingClient().send(
      new DescribeScalableTargetsCommand({
        ServiceNamespace: 'ecs',
        ResourceIds: this.services().map(
          (s) => `service/${this.cluster}/${s.service}`,
        ),
      }),
    );
    const out: Record<string, number> = {};
    for (const t of res.ScalableTargets ?? []) {
      const name = t.ResourceId?.split('/').pop();
      if (name && typeof t.MaxCapacity === 'number') {
        out[name] = t.MaxCapacity;
      }
    }
    return out;
  }

  /** This month's spend from AWS Budgets (reading a budget is free). */
  async cost(now: Date = new Date()): Promise<CostSnapshot | null> {
    if (!this.budgetAvailable) return null;
    // Budgets is a global service answered from us-east-1.
    this.budgets ??= new BudgetsClient({
      requestHandler: AWS_API_REQUEST_HANDLER,
      region: 'us-east-1',
      credentials: this.creds('us-east-1'),
    });
    const res = await this.budgets.send(
      new DescribeBudgetCommand({
        AccountId: this.env('OPS_AWS_ACCOUNT_ID'),
        BudgetName: this.env('OPS_BUDGET_NAME'),
      }),
    );
    const b = res.Budget;
    const amount = (v?: { Amount?: string }) =>
      v?.Amount !== undefined && Number.isFinite(Number(v.Amount))
        ? Number(v.Amount)
        : null;
    const limit = amount(b?.BudgetLimit);
    if (limit === null) return null;
    return {
      actualUsd: amount(b?.CalculatedSpend?.ActualSpend) ?? 0,
      forecastUsd: amount(b?.CalculatedSpend?.ForecastedSpend),
      limitUsd: limit,
      checkedAt: now.toISOString(),
    };
  }
}

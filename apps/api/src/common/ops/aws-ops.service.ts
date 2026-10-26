import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationAutoScalingClient,
  DescribeScalableTargetsCommand,
  RegisterScalableTargetCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets';
import {
  DescribeServicesCommand,
  ECSClient,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import type { CostSnapshot } from './ops.constants';
import { OpsStateService } from './ops-state.service';
import { opsCredentials } from './ops-credentials';

export type TaskKind = 'api' | 'worker';

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
      region: this.region(),
      credentials: this.creds(this.region()),
    }));
  }

  private scalingClient(): ApplicationAutoScalingClient {
    return (this.scaling ??= new ApplicationAutoScalingClient({
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

  /** The Terraform maximum of a service: the hard cap no automation or
   * override ever exceeds. */
  hardCap(kind: TaskKind): number {
    return kind === 'api'
      ? this.num('OPS_API_MAX_TASKS', 4)
      : this.num('OPS_WORKER_MAX_TASKS', 2);
  }

  /** Monthly cost of one running task (Terraform computes it from the
   * task size; the defaults match the launch sizes). */
  taskUsd(kind: TaskKind): number {
    return kind === 'api'
      ? this.num('OPS_API_TASK_USD', 18)
      : this.num('OPS_WORKER_TASK_USD', 28);
  }

  /**
   * 'min': autoscaling may not add tasks (bill stays at the floor);
   * 'normal': the ceiling the economy job last applied (else the
   * Terraform maximum). The floor never changes, so the app keeps
   * answering either way.
   */
  async setScale(mode: 'min' | 'normal'): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    const min = this.minTasks;
    const applied = mode === 'normal' ? await this.state?.ceiling() : null;
    for (const s of this.services()) {
      const kind: TaskKind =
        s.service === this.env('OPS_API_SERVICE') ? 'api' : 'worker';
      const normal = Math.min(s.normalMax, applied?.[kind] ?? s.normalMax);
      await this.registerMax(
        s.service,
        min,
        mode === 'min' ? min : Math.max(min, normal),
      );
    }
  }

  /** Sets the autoscaling ceilings (never below the floor nor above the
   * Terraform maximum). */
  async setCeilings(c: Record<TaskKind, number>): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    const min = this.minTasks;
    const api = this.env('OPS_API_SERVICE');
    const worker = this.env('OPS_WORKER_SERVICE');
    const pairs: [string | undefined, TaskKind][] = [
      [api, 'api'],
      [worker, 'worker'],
    ];
    for (const [service, kind] of pairs) {
      if (!service) continue;
      const max = Math.max(min, Math.min(c[kind], this.hardCap(kind)));
      await this.registerMax(service, min, max);
    }
  }

  private async registerMax(
    service: string,
    min: number,
    max: number,
  ): Promise<void> {
    await this.scalingClient().send(
      new RegisterScalableTargetCommand({
        ServiceNamespace: 'ecs',
        ScalableDimension: 'ecs:service:DesiredCount',
        ResourceId: `service/${this.cluster}/${service}`,
        MinCapacity: min,
        MaxCapacity: max,
      }),
    );
  }

  /** Tasks running / wanted now per service (null off AWS). */
  async taskCounts(): Promise<Record<
    TaskKind,
    { running: number; desired: number }
  > | null> {
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
    return { api: find(api), worker: find(worker) };
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

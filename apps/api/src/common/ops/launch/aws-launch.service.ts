import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BudgetsClient,
  DeleteBudgetCommand,
  DescribeBudgetCommand,
  DescribeBudgetsCommand,
  UpdateBudgetCommand,
} from '@aws-sdk/client-budgets';
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
  ListCostAllocationTagsCommand,
  type GetCostAndUsageCommandInput,
  type ResultByTime,
} from '@aws-sdk/client-cost-explorer';
import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SNSClient,
  SubscribeCommand,
  UnsubscribeCommand,
  type Subscription,
} from '@aws-sdk/client-sns';
import { PrismaService } from '../../../prisma/prisma.service';
import { SecretsService } from '../../secrets/secrets.service';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/** `https://events.pagerduty.com/integration/AbCd…wXyZ/enqueue` for the screen. */
export function maskPagerDutyUrl(url: string): string {
  const m = /^(https:\/\/[^/]+\/integration\/)([^/]+)(\/enqueue)$/.exec(url);
  if (!m) return '…';
  const k = m[2];
  return `${m[1]}${k.slice(0, 4)}…${k.slice(-4)}${m[3]}`;
}

export type PagingState = 'none' | 'pending' | 'confirmed';

export interface PagingStatus {
  available: boolean;
  configured: boolean;
  endpointMasked: string | null;
  state: PagingState;
  /** A subscription we made earlier points at another link (sync needed). */
  stale: boolean;
  checkedAt: string;
}

const PAGING_RECORD = 'ops.pagerduty_sub';

/**
 * Owner 2026-10-24: the PagerDuty link is saved in the admin (integration
 * «pagerduty») and the API itself subscribes it to the critical SNS topic
 * (`OPS_CRITICAL_TOPIC_ARN`, set by Terraform). The previous link we
 * subscribed is remembered only as a SHA-256 (app_config `ops.pagerduty_sub`)
 * so it can be removed on change. Terraform never manages this subscription.
 * IAM (infra/modules/stack): Subscribe / Unsubscribe / ListSubscriptionsByTopic
 * / Publish on that one topic.
 */
@Injectable()
export class PagerDutySnsService {
  private sns?: SNSClient;
  private cache?: { at: number; value: PagingStatus };

  constructor(
    private readonly config: ConfigService,
    private readonly secrets: SecretsService,
    private readonly prisma: PrismaService,
  ) {}

  get topicArn(): string | undefined {
    const v = this.config.get<string>('OPS_CRITICAL_TOPIC_ARN');
    return v && v.length > 0 ? v : undefined;
  }

  get available(): boolean {
    return !!this.topicArn;
  }

  private client(): SNSClient {
    return (this.sns ??= new SNSClient({
      region: this.topicArn?.split(':')[3] ?? 'us-east-1',
    }));
  }

  private async url(): Promise<string | null> {
    const u = await this.secrets.field('pagerduty', 'integrationUrl');
    return u && u.length > 0 ? u : null;
  }

  private async subscriptions(): Promise<Subscription[]> {
    const out: Subscription[] = [];
    let token: string | undefined;
    do {
      const r = await this.client().send(
        new ListSubscriptionsByTopicCommand({
          TopicArn: this.topicArn,
          NextToken: token,
        }),
      );
      out.push(...(r.Subscriptions ?? []));
      token = r.NextToken;
    } while (token);
    return out.filter((s) => s.Protocol === 'https');
  }

  private async record(): Promise<{ hash: string } | null> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: PAGING_RECORD },
    });
    const v = row?.value as { hash?: unknown } | null | undefined;
    return typeof v?.hash === 'string' ? { hash: v.hash } : null;
  }

  private async setRecord(hash: string | null): Promise<void> {
    if (hash === null) {
      await this.prisma.appConfig.deleteMany({ where: { key: PAGING_RECORD } });
      return;
    }
    await this.prisma.appConfig.upsert({
      where: { key: PAGING_RECORD },
      create: { key: PAGING_RECORD, value: { hash } },
      update: { value: { hash } },
    });
  }

  /** Cheap: one ListSubscriptionsByTopic, cached for a minute. */
  async status(fresh = false, now = new Date()): Promise<PagingStatus> {
    if (!fresh && this.cache && Date.now() - this.cache.at < 60_000) {
      return this.cache.value;
    }
    const url = await this.url();
    const base: PagingStatus = {
      available: this.available,
      configured: !!url,
      endpointMasked: url ? maskPagerDutyUrl(url) : null,
      state: 'none',
      stale: false,
      checkedAt: now.toISOString(),
    };
    if (!this.available) return base;
    const subs = await this.subscriptions();
    if (url) {
      const mine = subs.find((s) => s.Endpoint === url);
      if (mine) {
        base.state =
          mine.SubscriptionArn === 'PendingConfirmation'
            ? 'pending'
            : 'confirmed';
      }
    }
    const rec = await this.record();
    base.stale = !!rec && rec.hash !== (url ? sha(url) : '');
    this.cache = { at: Date.now(), value: base };
    return base;
  }

  /**
   * Makes SNS match the saved link: removes the link we subscribed before
   * (when it differs or the integration is gone), subscribes the new one.
   */
  async sync(): Promise<PagingStatus> {
    if (!this.available) return this.status(true);
    const url = await this.url();
    const subs = await this.subscriptions();
    const rec = await this.record();
    if (rec && rec.hash !== (url ? sha(url) : '')) {
      const old = subs.find(
        (s) => s.Endpoint && sha(s.Endpoint) === rec.hash && s.Endpoint !== url,
      );
      // A subscription still waiting for confirmation has no ARN to
      // remove; SNS drops it by itself after three days.
      if (
        old?.SubscriptionArn &&
        old.SubscriptionArn !== 'PendingConfirmation'
      ) {
        await this.client().send(
          new UnsubscribeCommand({ SubscriptionArn: old.SubscriptionArn }),
        );
      }
    }
    if (url) {
      if (!subs.some((s) => s.Endpoint === url)) {
        await this.client().send(
          new SubscribeCommand({
            TopicArn: this.topicArn,
            Protocol: 'https',
            Endpoint: url,
            ReturnSubscriptionArn: true,
            Attributes: { RawMessageDelivery: 'false' },
          }),
        );
      }
      await this.setRecord(sha(url));
    } else {
      await this.setRecord(null);
    }
    this.cache = undefined;
    return this.status(true);
  }

  /** A CloudWatch-shaped test alarm (PagerDuty understands this template). */
  async publishTest(now = new Date()): Promise<void> {
    if (!this.available) throw new Error('not on AWS');
    const message = {
      AlarmName: 'lawbid-test-page',
      NewStateValue: 'ALARM',
      NewStateReason: 'Test from the LawBid admin (Запуск)',
      Region: 'US East (N. Virginia)',
      StateChangeTime: now.toISOString().replace('Z', '+0000'),
      AlarmDescription: 'TEST - ignore',
      Trigger: { MetricName: 'x', Namespace: 'x' },
    };
    await this.client().send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: 'ALARM: "lawbid-test-page"',
        Message: JSON.stringify(message),
      }),
    );
  }
}

export interface BudgetRow {
  name: string;
  limitUsd: number | null;
  actualUsd: number | null;
  forecastUsd: number | null;
  timeUnit: string | null;
  /** The budget the cost guard and Terraform use (OPS_BUDGET_NAME). */
  prod: boolean;
  /** The old budget the admin may delete. */
  obsolete: boolean;
}

const OBSOLETE_DEFAULT = 'LawBid Monthly';

/**
 * Owner 2026-10-24: AWS Budgets from the admin — list every budget of the
 * account, change the monthly limit of the prod budget, delete the old
 * $50 «LawBid Monthly». IAM is scoped by name in Terraform. Terraform's own
 * budget ignores changes to the limit (modules/budget).
 */
@Injectable()
export class AwsBudgetsAdminService {
  private client?: BudgetsClient;
  private cache?: { at: number; rows: BudgetRow[] };

  constructor(private readonly config: ConfigService) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  get available(): boolean {
    return !!this.env('OPS_BUDGET_NAME') && !!this.env('OPS_AWS_ACCOUNT_ID');
  }

  get prodName(): string | undefined {
    return this.env('OPS_BUDGET_NAME');
  }

  get obsoleteName(): string {
    return this.env('OPS_OBSOLETE_BUDGET_NAME') ?? OBSOLETE_DEFAULT;
  }

  private b(): BudgetsClient {
    // Budgets is a global service answered from us-east-1.
    return (this.client ??= new BudgetsClient({ region: 'us-east-1' }));
  }

  async list(fresh = false): Promise<BudgetRow[]> {
    if (!this.available) return [];
    if (!fresh && this.cache && Date.now() - this.cache.at < 120_000) {
      return this.cache.rows;
    }
    const num = (v?: { Amount?: string }) =>
      v?.Amount !== undefined && Number.isFinite(Number(v.Amount))
        ? Number(v.Amount)
        : null;
    const rows: BudgetRow[] = [];
    let token: string | undefined;
    do {
      const r = await this.b().send(
        new DescribeBudgetsCommand({
          AccountId: this.env('OPS_AWS_ACCOUNT_ID'),
          MaxResults: 100,
          NextToken: token,
        }),
      );
      for (const x of r.Budgets ?? []) {
        const name = x.BudgetName ?? '';
        rows.push({
          name,
          limitUsd: num(x.BudgetLimit),
          actualUsd: num(x.CalculatedSpend?.ActualSpend),
          forecastUsd: num(x.CalculatedSpend?.ForecastedSpend),
          timeUnit: x.TimeUnit ?? null,
          prod: name === this.prodName,
          obsolete: name === this.obsoleteName && name !== this.prodName,
        });
      }
      token = r.NextToken;
    } while (token);
    this.cache = { at: Date.now(), rows };
    return rows;
  }

  async setLimit(name: string, usd: number): Promise<void> {
    if (name !== this.prodName) {
      throw new Error('Only the production budget can be changed here.');
    }
    const cur = await this.b().send(
      new DescribeBudgetCommand({
        AccountId: this.env('OPS_AWS_ACCOUNT_ID'),
        BudgetName: name,
      }),
    );
    const budget = cur.Budget;
    if (!budget) throw new Error('Budget not found.');
    const next = {
      ...budget,
      BudgetLimit: {
        Amount: usd.toFixed(2),
        Unit: budget.BudgetLimit?.Unit ?? 'USD',
      },
      CalculatedSpend: undefined,
      LastUpdatedTime: undefined,
    };
    await this.b().send(
      new UpdateBudgetCommand({
        AccountId: this.env('OPS_AWS_ACCOUNT_ID'),
        NewBudget: next,
      }),
    );
    this.cache = undefined;
  }

  async remove(name: string): Promise<void> {
    if (name === this.prodName || name !== this.obsoleteName) {
      throw new Error('Only the obsolete budget can be deleted here.');
    }
    await this.b().send(
      new DeleteBudgetCommand({
        AccountId: this.env('OPS_AWS_ACCOUNT_ID'),
        BudgetName: name,
      }),
    );
    this.cache = undefined;
  }
}

export interface CostDay {
  date: string;
  /** Usage etc. before credits. */
  gross: number;
  /** Credits applied (positive number). */
  credits: number;
}

export interface AwsCostReport {
  monthToDate: { gross: number; credits: number };
  lastMonth: { gross: number; credits: number };
  byService: { service: string; gross: number; credits: number }[];
  daily: CostDay[];
  forecastRestGross: number | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Splits CE record types: Credit / Refund are credits, the rest is the bill. */
export function splitRecordType(type: string, usd: number) {
  return type === 'Credit' || type === 'Refund'
    ? { gross: 0, credits: -usd }
    : { gross: usd, credits: 0 };
}

/**
 * Owner 2026-10-24: Cost Explorer costs $0.01 per request, so one refresh
 * is three requests (by service x record type for two months, daily for 30
 * days, one forecast) and the caller (SpendService) runs it at most every
 * 6 hours. Also the read-only «cost allocation tags» list for «Запуск»,
 * cached 6 hours as well.
 */
@Injectable()
export class AwsCostService {
  private ce?: CostExplorerClient;
  private tags?: { at: number; keys: string[] };

  private c(): CostExplorerClient {
    return (this.ce ??= new CostExplorerClient({ region: 'us-east-1' }));
  }

  async activeTagKeys(): Promise<string[]> {
    if (this.tags && Date.now() - this.tags.at < 6 * 3600_000) {
      return this.tags.keys;
    }
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const r = await this.c().send(
        new ListCostAllocationTagsCommand({
          Status: 'Active',
          NextToken: token,
          MaxResults: 100,
        }),
      );
      for (const t of r.CostAllocationTags ?? []) {
        if (t.TagKey) keys.push(t.TagKey);
      }
      token = r.NextToken;
    } while (token);
    this.tags = { at: Date.now(), keys };
    return keys;
  }

  private async usage(input: GetCostAndUsageCommandInput) {
    const out: ResultByTime[] = [];
    let token: string | undefined;
    do {
      const r = await this.c().send(
        new GetCostAndUsageCommand({ ...input, NextPageToken: token }),
      );
      out.push(...(r.ResultsByTime ?? []));
      token = r.NextPageToken;
    } while (token);
    return out;
  }

  async report(now: Date = new Date()): Promise<AwsCostReport> {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const thisStart = new Date(Date.UTC(y, m, 1));
    const lastStart = new Date(Date.UTC(y, m - 1, 1));
    const tomorrow = new Date(Date.UTC(y, m, now.getUTCDate() + 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 1));
    const from30 = new Date(Date.UTC(y, m, now.getUTCDate() - 29));

    const monthly = await this.usage({
      TimePeriod: { Start: ymd(lastStart), End: ymd(tomorrow) },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
      GroupBy: [
        { Type: 'DIMENSION', Key: 'SERVICE' },
        { Type: 'DIMENSION', Key: 'RECORD_TYPE' },
      ],
    });
    const mtd = { gross: 0, credits: 0 };
    const last = { gross: 0, credits: 0 };
    const bySvc = new Map<string, { gross: number; credits: number }>();
    for (const period of monthly) {
      const isThis = (period.TimePeriod?.Start ?? '') >= ymd(thisStart);
      for (const g of period.Groups ?? []) {
        const [service = '?', type = ''] = g.Keys ?? [];
        const usd = Number(g.Metrics?.UnblendedCost?.Amount ?? 0);
        const s = splitRecordType(type, usd);
        const target = isThis ? mtd : last;
        target.gross += s.gross;
        target.credits += s.credits;
        if (isThis) {
          const row = bySvc.get(service) ?? { gross: 0, credits: 0 };
          row.gross += s.gross;
          row.credits += s.credits;
          bySvc.set(service, row);
        }
      }
    }

    const dailyRaw = await this.usage({
      TimePeriod: { Start: ymd(from30), End: ymd(tomorrow) },
      Granularity: 'DAILY',
      Metrics: ['UnblendedCost'],
      GroupBy: [{ Type: 'DIMENSION', Key: 'RECORD_TYPE' }],
    });
    const daily: CostDay[] = dailyRaw.map((p) => {
      let gross = 0;
      let credits = 0;
      for (const g of p.Groups ?? []) {
        const s = splitRecordType(
          g.Keys?.[0] ?? '',
          Number(g.Metrics?.UnblendedCost?.Amount ?? 0),
        );
        gross += s.gross;
        credits += s.credits;
      }
      return { date: p.TimePeriod?.Start ?? '', gross, credits };
    });

    let forecastRestGross: number | null = null;
    if (tomorrow < monthEnd) {
      try {
        const f = await this.c().send(
          new GetCostForecastCommand({
            TimePeriod: { Start: ymd(tomorrow), End: ymd(monthEnd) },
            Metric: 'UNBLENDED_COST',
            Granularity: 'MONTHLY',
          }),
        );
        forecastRestGross = Number(f.Total?.Amount ?? 0);
      } catch {
        // A new account has too little history; the caller extrapolates.
        forecastRestGross = null;
      }
    } else {
      forecastRestGross = 0;
    }
    return {
      monthToDate: mtd,
      lastMonth: last,
      byService: [...bySvc.entries()]
        .map(([service, v]) => ({ service, ...v }))
        .filter((r) => Math.abs(r.gross) > 0.005 || Math.abs(r.credits) > 0.005)
        .sort((a, b) => b.gross - a.gross),
      daily,
      forecastRestGross,
    };
  }
}

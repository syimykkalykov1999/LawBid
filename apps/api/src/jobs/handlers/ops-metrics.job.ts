import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { AdminSummaryService } from '../../common/admin-summary/admin-summary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DASHBOARD_SUMMARY_KEY } from '../../modules/admin/dashboard.service';
import type { DashboardDto } from '../../modules/admin/admin.dto';
import {
  STRIPE_WEBHOOKS_DLQ,
  STRIPE_WEBHOOKS_QUEUE,
  SUBSCRIPTION_JOBS_QUEUE,
} from '../../modules/billing/billing.constants';
import { HISTORY_EXPORT_QUEUE } from '../../modules/case-history/case-history-export.runner';
import { FILES_QUEUE } from '../../modules/files/jobs/file-scan.runner';
import { CASE_FANOUT_QUEUE } from '../../modules/notifications/case-fanout/case-fanout.service';
import { PUSH_QUEUE } from '../../modules/notifications/push/push.constants';
import { DATA_EXPORT_QUEUE } from '../../modules/privacy/privacy.constants';
import { CRON_QUEUE } from '../jobs.constants';
import { bullOptions } from '../../redis/redis-connection';

/** Every BullMQ queue of the system (docs/06 §6.3 list + the later ones). */
export const OBSERVED_QUEUES: readonly string[] = [
  CRON_QUEUE,
  PUSH_QUEUE,
  CASE_FANOUT_QUEUE,
  FILES_QUEUE,
  STRIPE_WEBHOOKS_QUEUE,
  STRIPE_WEBHOOKS_DLQ,
  SUBSCRIPTION_JOBS_QUEUE,
  HISTORY_EXPORT_QUEUE,
  DATA_EXPORT_QUEUE,
];

export interface QueueDepth {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  /** Age of the oldest waiting job (0 when none). */
  oldestAgeSeconds: number;
}

/** The dashboard summary is recounted every 2 min; older than this = stuck. */
const SUMMARY_MAX_AGE_MS = 10 * 60_000;

export interface BusinessCounters {
  registrations24h: number;
  casesOpen: number;
  bidsActive: number;
  subscriptionsActive: number;
  subscriptionsTrialing: number;
  subscriptionsPastDue: number;
}

/**
 * docs/06 §8 — metrics that CloudWatch cannot see on its own, emitted as
 * structured log lines (`metric` field) and turned into metrics by the
 * log metric filters in infra/modules/monitoring: queue depth / oldest
 * job age per queue (every minute) and the business counters of the
 * Grafana dashboard (every 10 minutes; all index-range counts).
 */
@Injectable()
export class OpsMetricsJob implements OnModuleDestroy {
  private queues?: Queue[];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Optional() private readonly summary?: AdminSummaryService,
  ) {
    this.logger.setContext(OpsMetricsJob.name);
  }

  private open(): Queue[] {
    if (!this.queues) {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      this.queues = OBSERVED_QUEUES.map(
        (name) => new Queue(name, bullOptions(name, url)),
      );
    }
    return this.queues;
  }

  async queueDepths(now: Date = new Date()): Promise<QueueDepth[]> {
    const out: QueueDepth[] = [];
    for (const q of this.open()) {
      const counts = await q.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
      );
      const [oldest] = await q.getWaiting(0, 0);
      const row: QueueDepth = {
        queue: q.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        oldestAgeSeconds: oldest
          ? Math.max(0, Math.floor((now.getTime() - oldest.timestamp) / 1000))
          : 0,
      };
      out.push(row);
      this.logger.info({ metric: 'queue_depth', ...row }, 'queue depth');
    }
    // Owner 2026-10-22: the worker service scales on this one number
    // (CloudWatch QueueWaitingTotal ÷ running tasks, infra/modules/ecs).
    // The DLQ has no consumer, so its jobs never count as backlog.
    const waiting = out
      .filter((r) => r.queue !== STRIPE_WEBHOOKS_DLQ)
      .reduce((sum, r) => sum + r.waiting, 0);
    this.logger.info(
      { metric: 'queue_waiting_total', waiting },
      'queue waiting total',
    );
    return out;
  }

  /**
   * Dedup D-3: open cases and the trialing / active / past_due subscription
   * counts are the numbers the admin dashboard already recounts every two
   * minutes (`admin.summaries`). They are read from that stored summary and
   * only logged here; the database is asked again only when no summary is
   * stored or it is older than [SUMMARY_MAX_AGE_MS] (a stuck refresher).
   * Registrations and active bids are not in the dashboard, so they are
   * still counted here.
   */
  async businessCounters(now: Date = new Date()): Promise<BusinessCounters> {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const [registrations24h, bidsActive, shared] = await Promise.all([
      this.prisma.user.count({ where: { created_at: { gte: since } } }),
      this.prisma.bid.count({ where: { status: 'active' } }),
      this.fromDashboardSummary(now),
    ]);
    const counted = shared ?? (await this.countShared());
    const counters: BusinessCounters = {
      registrations24h,
      bidsActive,
      ...counted,
    };
    this.logger.info({ metric: 'business', ...counters }, 'business counters');
    return counters;
  }

  private async fromDashboardSummary(
    now: Date,
  ): Promise<Pick<
    BusinessCounters,
    | 'casesOpen'
    | 'subscriptionsActive'
    | 'subscriptionsTrialing'
    | 'subscriptionsPastDue'
  > | null> {
    const hit = await this.summary?.peek<DashboardDto>(DASHBOARD_SUMMARY_KEY);
    if (!hit) return null;
    const age = now.getTime() - Date.parse(hit.computedAt);
    if (!(age <= SUMMARY_MAX_AGE_MS)) return null;
    const d = hit.data;
    return {
      casesOpen: d.openCases,
      subscriptionsActive: d.subscriptions.active,
      subscriptionsTrialing: d.subscriptions.trialing,
      subscriptionsPastDue: d.subscriptions.pastDue,
    };
  }

  private async countShared() {
    const [
      casesOpen,
      subscriptionsActive,
      subscriptionsTrialing,
      subscriptionsPastDue,
    ] = await Promise.all([
      this.prisma.case.count({ where: { status: 'open' } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({ where: { status: 'trialing' } }),
      this.prisma.subscription.count({ where: { status: 'past_due' } }),
    ]);
    return {
      casesOpen,
      subscriptionsActive,
      subscriptionsTrialing,
      subscriptionsPastDue,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all((this.queues ?? []).map((q) => q.close()));
  }
}

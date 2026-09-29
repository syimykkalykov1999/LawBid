import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import {
  STRIPE_WEBHOOKS_DLQ,
  STRIPE_WEBHOOKS_QUEUE,
  SUBSCRIPTION_JOBS_QUEUE,
} from '../../modules/billing/billing.constants';
import { HISTORY_EXPORT_QUEUE } from '../../modules/case-history/case-history-export.runner';
import { FILES_QUEUE } from '../../modules/files/jobs/file-scan.runner';
import { PUSH_QUEUE } from '../../modules/notifications/push/push.constants';
import { DATA_EXPORT_QUEUE } from '../../modules/privacy/privacy.constants';
import { CRON_QUEUE } from '../jobs.constants';

/** Every BullMQ queue of the system (docs/06 §6.3 list + the later ones). */
export const OBSERVED_QUEUES: readonly string[] = [
  CRON_QUEUE,
  PUSH_QUEUE,
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
  ) {
    this.logger.setContext(OpsMetricsJob.name);
  }

  private open(): Queue[] {
    if (!this.queues) {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      this.queues = OBSERVED_QUEUES.map(
        (name) => new Queue(name, { connection: { url } }),
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
    return out;
  }

  async businessCounters(now: Date = new Date()): Promise<BusinessCounters> {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const [
      registrations24h,
      casesOpen,
      bidsActive,
      subscriptionsActive,
      subscriptionsTrialing,
      subscriptionsPastDue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { created_at: { gte: since } } }),
      this.prisma.case.count({ where: { status: 'open' } }),
      this.prisma.bid.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
      this.prisma.subscription.count({ where: { status: 'trialing' } }),
      this.prisma.subscription.count({ where: { status: 'past_due' } }),
    ]);
    const counters: BusinessCounters = {
      registrations24h,
      casesOpen,
      bidsActive,
      subscriptionsActive,
      subscriptionsTrialing,
      subscriptionsPastDue,
    };
    this.logger.info({ metric: 'business', ...counters }, 'business counters');
    return counters;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all((this.queues ?? []).map((q) => q.close()));
  }
}

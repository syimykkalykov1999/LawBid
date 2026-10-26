import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
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
import { CASE_FANOUT_QUEUE } from '../../modules/notifications/case-fanout/case-fanout.service';
import { PUSH_QUEUE } from '../../modules/notifications/push/push.constants';
import { DATA_EXPORT_QUEUE } from '../../modules/privacy/privacy.constants';
import {
  CRON_FAST_QUEUE,
  CRON_HEAVY_QUEUE,
  CRON_QUEUE,
} from '../jobs.constants';
import { ACCOUNT_DELETION_QUEUE } from '../../modules/privacy/privacy.constants';
import { MEDIA_MODERATION_QUEUE } from '../../modules/media-moderation/media-moderation.constants';
import { CHANNEL_FANOUT_QUEUE } from '../../modules/channels/channel-fanout.runner';
import { BROADCAST_QUEUE } from '../../modules/admin-content/broadcast-fanout.runner';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { queueLoadSignal } from '../../common/queues/queue-load';
import { parseQueueMode } from '../../common/queues/queue-hardening';
import { bullOptions } from '../../redis/redis-connection';

/** Stripe queue names/options for the admin replay tool (S10-7), re-exported
 * here so the admin module reaches billing through the jobs layer. */
export {
  STRIPE_WEBHOOK_JOB,
  STRIPE_WEBHOOKS_DLQ,
  STRIPE_WEBHOOKS_QUEUE,
  WEBHOOK_JOB_OPTS,
} from '../../modules/billing/billing.constants';

/** Every BullMQ queue of the system (docs/06 §6.3 list + the later ones). */
export const OBSERVED_QUEUES: readonly string[] = [
  CRON_QUEUE,
  CRON_FAST_QUEUE,
  CRON_HEAVY_QUEUE,
  // S10-7: queues whose failures used to reach only the logs.
  ACCOUNT_DELETION_QUEUE,
  MEDIA_MODERATION_QUEUE,
  CHANNEL_FANOUT_QUEUE,
  BROADCAST_QUEUE,
  PUSH_QUEUE,
  CASE_FANOUT_QUEUE,
  FILES_QUEUE,
  STRIPE_WEBHOOKS_QUEUE,
  STRIPE_WEBHOOKS_DLQ,
  SUBSCRIPTION_JOBS_QUEUE,
  HISTORY_EXPORT_QUEUE,
  DATA_EXPORT_QUEUE,
];

/**
 * Queues where a long wait is normal (long jobs one at a time, bulk
 * fan-outs, a daily batch of deletions): their head may be older than the
 * 5-minute backlog alarm without anything being wrong. They still count in
 * the autoscaling signal and the failed-job alarm; the board and the
 * `QueueOldestAgeSecondsAll` metric leave them out and a separate, lenient
 * 1-hour alarm (`QueueOldestAgeSecondsSlow`) watches them (S10-2/S10-7).
 */
export const SLOW_LANE_QUEUES: readonly string[] = [
  CRON_HEAVY_QUEUE,
  ACCOUNT_DELETION_QUEUE,
  CHANNEL_FANOUT_QUEUE,
  BROADCAST_QUEUE,
];

export interface QueueDepth {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  /** Jobs that ended in `failed` during the last 5 minutes (BullMQ metrics,
   * i.e. retries exhausted) — what the failed-job alarm reads (S10-7). */
  failed5m: number;
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
    @Optional() private readonly settings?: AppSettingsService,
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
        failed5m: await this.failedLast5m(q),
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
    // S10-10: weighted by job cost and old-queue-head pressure (admin
    // «queues.scale_signal_mode»: off = the old flat count).
    const mode = parseQueueMode(
      await this.settings
        ?.string('queues.scale_signal_mode')
        .catch(() => 'auto'),
    );
    const load = queueLoadSignal(out, mode);
    this.logger.info(
      {
        metric: 'queue_waiting_total',
        waiting: load.signal,
        rawWaiting: load.rawWaiting,
        mode,
      },
      'queue waiting total',
    );
    return out;
  }

  /** Failures of the last 5 minutes from BullMQ's own metrics (needs
   * `metrics` on the workers, see workerTuning); 0 when not available. */
  private async failedLast5m(q: Queue): Promise<number> {
    try {
      const m = await q.getMetrics('failed', 0, 4);
      return m.data.reduce((sum, n) => sum + n, 0);
    } catch {
      return 0;
    }
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

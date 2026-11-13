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
import { DEAL_RECORD_QUEUE } from '../../modules/deals/deal-record.runner';
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
import { POST_FANOUT_QUEUE } from '../../modules/notifications/post-fanout.service';
import { CHANNEL_FANOUT_QUEUE } from '../../modules/channels/channel-fanout.runner';
import { BROADCAST_QUEUE } from '../../modules/admin-content/broadcast-fanout.runner';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { queueLoadSignal } from '../../common/queues/queue-load';
import { parseQueueMode } from '../../common/queues/queue-hardening';
import { bullOptions } from '../../redis/redis-connection';
import { REGISTRY_CHECK_QUEUE } from '../../modules/verification/registry-check.queue';

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
  POST_FANOUT_QUEUE,
  BROADCAST_QUEUE,
  PUSH_QUEUE,
  CASE_FANOUT_QUEUE,
  FILES_QUEUE,
  STRIPE_WEBHOOKS_QUEUE,
  STRIPE_WEBHOOKS_DLQ,
  SUBSCRIPTION_JOBS_QUEUE,
  HISTORY_EXPORT_QUEUE,
  DEAL_RECORD_QUEUE,
  DATA_EXPORT_QUEUE,
  // R-394: state-registry lookups of the verifier's buttons.
  REGISTRY_CHECK_QUEUE,
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
  POST_FANOUT_QUEUE,
  BROADCAST_QUEUE,
];

/** `failedLast5m` reads the failed set in pages of this many jobs... */
const FAILED_5M_PAGE = 20;
/** ...and stops here: the alarms fire at 1 and 10, the failed set keeps 200. */
const FAILED_5M_MAX = 200;

export interface QueueDepth {
  queue: string;
  /** Runnable now: the `wait` list plus the `prioritized` set. */
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
/**
 * How long a waiting job has been RUNNABLE, in seconds. 08.11 (G8): BullMQ
 * job schedulers create the next run at once as a delayed job
 * (`timestamp` = creation, `delay` = until it is due), so `now - timestamp`
 * counted the whole schedule period as waiting: prod showed the `cron` lane's
 * oldest job at exactly 59 / 119 / 299 / 599 / 3599 s (the 1, 2, 5, 10 and
 * 60 minute schedules) and the queue-backlog alarm (> 300 s) flapped all day
 * although nothing was stuck; the same number fed the worker autoscaling.
 * The age counts from the moment the job was due: `timestamp + delay`.
 */
export function waitingAgeSeconds(
  job: { timestamp: number; delay?: number; opts?: { delay?: number } },
  now: Date,
): number {
  const delay = Number(job.delay ?? job.opts?.delay ?? 0);
  const due = job.timestamp + (Number.isFinite(delay) && delay > 0 ? delay : 0);
  return Math.max(0, Math.floor((now.getTime() - due) / 1000));
}

@Injectable()
export class OpsMetricsJob implements OnModuleDestroy {
  private queues?: Queue[];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Optional() private readonly settings?: AppSettingsService,
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
      // 13.11 (owner list row 79, 1B load test): a job added with a
      // `priority` waits in BullMQ's `prioritized` set, not in the `wait`
      // list that getJobCounts('waiting') reads — every push job has one
      // (PUSH_PRIORITY), so 386 409 waiting pushes were logged as
      // `waiting: 0` and the worker never scaled out for them. Runnable =
      // wait + prioritized; the older of the two heads gives the age.
      const counts = await q.getJobCounts(
        'waiting',
        'prioritized',
        'active',
        'delayed',
        'failed',
      );
      const prioritized = counts.prioritized ?? 0;
      const [oldest] = await q.getWaiting(0, 0);
      const [nextPrioritized] =
        prioritized > 0 ? await q.getPrioritized(0, 0) : [];
      const ages = [oldest, nextPrioritized]
        .filter((j) => j !== undefined && j !== null)
        .map((j) => waitingAgeSeconds(j, now));
      const row: QueueDepth = {
        queue: q.name,
        waiting: (counts.waiting ?? 0) + prioritized,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        failed5m: await this.failedLast5m(q, now.getTime()),
        oldestAgeSeconds: ages.length > 0 ? Math.max(...ages) : 0,
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

  /**
   * Jobs that failed for good in the last 5 minutes, read from the failed
   * set itself (BullMQ scores it by finish time; `getFailed` is newest
   * first). Prod 2026-11-13 (KNOWN_ERRORS 125): `getMetrics('failed')` was
   * used before, but BullMQ appends a metrics point only when the NEXT job
   * fails, so after the 11.11 outage the last five points (33) were read
   * every minute for 40 hours and `queue-failed-many` stayed in ALARM with
   * zero failures. Paged so a quiet queue costs one job read; 0 on error.
   */
  async failedLast5m(q: Queue, now: number = Date.now()): Promise<number> {
    const since = now - 5 * 60_000;
    let count = 0;
    try {
      for (let start = 0; start < FAILED_5M_MAX; start += FAILED_5M_PAGE) {
        const page = await q.getFailed(start, start + FAILED_5M_PAGE - 1);
        for (const job of page) {
          if ((job.finishedOn ?? 0) < since) return count;
          count++;
        }
        if (page.length < FAILED_5M_PAGE) return count;
      }
      return count;
    } catch {
      return 0;
    }
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

import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, Queue, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BILLING_OPTIONS,
  type BillingModuleOptions,
  STRIPE_WEBHOOKS_DLQ,
  STRIPE_WEBHOOKS_QUEUE,
  SUBSCRIPTION_JOBS_QUEUE,
  TRIAL_REMINDER_DAYS_BEFORE,
  TRIAL_REMINDER_JOB,
  TRIAL_REMINDER_MISSED_AFTER_MS,
  TRIAL_REMINDER_RECONCILE_JOB,
} from './billing.constants';
import { TRIAL_REMINDER_JOB_OPTS, trialReminderJob } from './trial-reminder';
import type { ProviderEvent } from './payment-provider';
import type { StripeWebhookJobData } from './stripe-webhook.intake';
import { SubscriptionSyncService } from './subscription-sync.service';
import { bullOptions } from '../../redis/redis-connection';
import { keepJobScheduler } from '../../common/queues/keep-scheduler';
import {
  closeWorker,
  workerTuning,
  outageProof,
  isStalledFailure,
} from '../../common/queues/queue-hardening';
import {
  queueConcurrency,
  trackConcurrency,
} from '../../common/queues/queue-concurrency';

/**
 * BullMQ workers of the billing queues — in the `worker` process always,
 * in the API process while JOBS_ENABLED (like the cron runner):
 *  - `stripe-webhooks`: loads the stored event, re-reads state from the
 *    provider through SubscriptionSyncService; 5 attempts with backoff,
 *    then the dead-letter queue + an error log (§1.5 "алерт");
 *  - `subscriptions`: the trial reminder 2 days before `trial_ends_at`.
 */
@Injectable()
export class BillingRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BillingRunner.name);
  private workers: Worker[] = [];
  private dlq?: Queue;
  private subscriptionsQueue?: Queue;
  private stopKeep?: () => void;

  constructor(
    @Inject(BILLING_OPTIONS) private readonly options: BillingModuleOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sync: SubscriptionSyncService,
    private readonly notifications: NotificationsService,
  ) {}

  get enabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || !this.enabled) return;
    this.dlq = new Queue(
      STRIPE_WEBHOOKS_DLQ,
      bullOptions(STRIPE_WEBHOOKS_DLQ, url),
    );
    this.subscriptionsQueue = new Queue(
      SUBSCRIPTION_JOBS_QUEUE,
      bullOptions(SUBSCRIPTION_JOBS_QUEUE, url),
    );
    // S10-6: durable truth is the subscription row, the delayed job only a
    // trigger — an hourly scheduler (one per id, however many processes)
    // puts back what Redis lost. Stripe/Netflix pattern "DB truth, queue
    // trigger, periodic reconcile".
    // Pack C (round 2 #11): re-checked every heartbeat, not only at boot.
    this.stopKeep = keepJobScheduler(
      this.subscriptionsQueue,
      TRIAL_REMINDER_RECONCILE_JOB,
      { every: 60 * 60_000 },
      {
        name: TRIAL_REMINDER_RECONCILE_JOB,
        opts: {
          removeOnComplete: { count: 24 },
          removeOnFail: { count: 50 },
        },
      },
      (e: unknown) =>
        this.logger.warn(
          `trial reminder reconcile not scheduled: ${String(e)}`,
        ),
    );
    this.workers.push(
      new Worker<StripeWebhookJobData>(
        STRIPE_WEBHOOKS_QUEUE,
        outageProof((job) => this.processWebhook(job)),
        {
          ...bullOptions(STRIPE_WEBHOOKS_QUEUE, url, { worker: true }),
          ...workerTuning(STRIPE_WEBHOOKS_QUEUE),
          concurrency: queueConcurrency(STRIPE_WEBHOOKS_QUEUE),
        },
      ),
      new Worker<{ subscriptionId: string }>(
        SUBSCRIPTION_JOBS_QUEUE,
        outageProof((job) => this.processSubscriptionJob(job)),
        {
          ...bullOptions(SUBSCRIPTION_JOBS_QUEUE, url, { worker: true }),
          ...workerTuning(SUBSCRIPTION_JOBS_QUEUE),
          concurrency: queueConcurrency(SUBSCRIPTION_JOBS_QUEUE),
        },
      ),
    );
    for (const w of this.workers) {
      trackConcurrency(w);
      w.on('failed', (job, err) => void this.onFailed(w.name, job, err));
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopKeep?.();
    await Promise.all([
      ...this.workers.map((w) => closeWorker(w)),
      this.dlq?.close(),
      this.subscriptionsQueue?.close(),
    ]).catch(() => undefined);
  }

  /**
   * A failed job is logged. Verify batch 13 (Q2): a webhook job that
   * stalled more often than allowed (the worker task stopped twice in the
   * middle of it: Spot stop, OOM, deploy) is failed by BullMQ WITHOUT using
   * up an attempt, so the processor's "last attempt → DLQ" never ran and
   * the requeue sweep skips a failed job: the event sat unprocessed and out
   * of the DLQ the admin replays. It goes to the DLQ here (same id, so a
   * second copy is a no-op), like the export runners handle a stall.
   */
  async onFailed(
    queue: string,
    job: Job | undefined,
    err: Error,
  ): Promise<void> {
    this.logger.warn(
      `${queue} job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
    );
    if (queue !== STRIPE_WEBHOOKS_QUEUE || !job || !isStalledFailure(err)) {
      return;
    }
    const { eventId } = job.data as StripeWebhookJobData;
    await this.toDlq(eventId, err.message).catch((e: unknown) =>
      this.logger.error(
        { eventId, err: String(e) },
        'stalled stripe webhook not moved to DLQ',
      ),
    );
  }

  private async toDlq(eventId: string, error: string): Promise<void> {
    await this.dlq?.add(
      'dead',
      { eventId, error },
      {
        jobId: eventId,
        removeOnComplete: { count: 5_000 },
        removeOnFail: { count: 5_000 },
      },
    );
    // Foreman re-check 25.11 (item 8): the stored row is marked dead, so the
    // every-minute requeue sweep stops reading it (the admin «Повторить»
    // clears the mark). Best effort: the DLQ job above is what matters.
    await this.prisma.stripeWebhookEvent
      .updateMany({
        where: { stripe_event_id: eventId, processed_at: null },
        data: { dead_at: new Date() },
      })
      .catch((e: unknown) =>
        this.logger.warn(`dead_at of ${eventId} not set: ${String(e)}`),
      );
  }

  private async processWebhook(job: Job<StripeWebhookJobData>): Promise<void> {
    const row = await this.prisma.stripeWebhookEvent.findUnique({
      where: { stripe_event_id: job.data.eventId },
    });
    if (!row || row.processed_at) return;
    const event: ProviderEvent = {
      id: row.stripe_event_id,
      type: row.type,
      created: Math.floor(row.created_at.getTime() / 1000),
      object: row.payload as ProviderEvent['object'],
    };
    try {
      await this.sync.handleEvent(event);
      await this.prisma.stripeWebhookEvent.update({
        where: { stripe_event_id: row.stripe_event_id },
        data: { processed_at: new Date(), attempts: { increment: 1 } },
      });
    } catch (e) {
      await this.prisma.stripeWebhookEvent
        .update({
          where: { stripe_event_id: row.stripe_event_id },
          data: { attempts: { increment: 1 } },
        })
        .catch(() => undefined);
      const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (last) {
        this.logger.error(
          { eventId: row.stripe_event_id, type: row.type, err: String(e) },
          'stripe webhook moved to DLQ',
        );
        await this.toDlq(row.stripe_event_id, String(e));
      }
      throw e;
    }
  }

  private async processSubscriptionJob(
    job: Job<{ subscriptionId: string }>,
  ): Promise<void> {
    if (job.name === TRIAL_REMINDER_RECONCILE_JOB) {
      await this.reconcileTrialReminders();
      return;
    }
    if (job.name !== TRIAL_REMINDER_JOB) return;
    const row = await this.prisma.subscription.findUnique({
      where: { id: job.data.subscriptionId },
    });
    // §1.5: skipped once canceled (or no longer trialing).
    if (
      !row ||
      row.status !== 'trialing' ||
      row.cancel_at_period_end ||
      !row.trial_ends_at
    )
      return;
    await this.notifications.emit({
      type: 'subscription_trial_ending',
      recipientId: row.user_id,
      payload: {
        trialEndsAt: row.trial_ends_at.toISOString(),
        amountCents: row.price_cents,
      },
    });
  }

  /**
   * S10-6: for every trialing, not-canceled subscription —
   *  - reminder still in the future: add the delayed job again (same job id,
   *    so BullMQ ignores it while the job exists and re-creates it when
   *    Redis lost it);
   *  - reminder time passed more than 30 min ago but no
   *    `subscription_trial_ending` notification exists since the trial
   *    started: send it now (late beats never).
   * Pages by id; bounded per run (hourly, so the rest follows).
   */
  async reconcileTrialReminders(
    now: Date = new Date(),
  ): Promise<{ scheduled: number; late: number }> {
    if (!this.subscriptionsQueue) return { scheduled: 0, late: 0 };
    let scheduled = 0;
    let late = 0;
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const rows = await this.prisma.subscription.findMany({
        where: {
          status: 'trialing',
          cancel_at_period_end: false,
          trial_ends_at: { gt: now },
        },
        select: {
          id: true,
          user_id: true,
          trial_started_at: true,
          trial_ends_at: true,
          price_cents: true,
        },
        orderBy: { id: 'asc' },
        take: 500,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      });
      if (rows.length === 0) break;
      const jobs = [];
      for (const row of rows) {
        const spec = trialReminderJob(row, now.getTime());
        if (spec) {
          jobs.push({
            name: TRIAL_REMINDER_JOB,
            data: { subscriptionId: row.id },
            opts: {
              ...TRIAL_REMINDER_JOB_OPTS,
              jobId: spec.jobId,
              delay: spec.delay,
            },
          });
          continue;
        }
        const reminderAt =
          (row.trial_ends_at as Date).getTime() -
          TRIAL_REMINDER_DAYS_BEFORE * 86_400_000;
        if (now.getTime() - reminderAt < TRIAL_REMINDER_MISSED_AFTER_MS)
          continue;
        const sent = await this.prisma.notification.findFirst({
          where: {
            user_id: row.user_id,
            type: 'subscription_trial_ending',
            created_at: {
              gte: row.trial_started_at ?? new Date(reminderAt - 86_400_000),
            },
          },
          select: { id: true },
        });
        if (sent) continue;
        await this.notifications.emit({
          type: 'subscription_trial_ending',
          recipientId: row.user_id,
          payload: {
            trialEndsAt: (row.trial_ends_at as Date).toISOString(),
            amountCents: row.price_cents,
          },
        });
        late++;
      }
      if (jobs.length > 0) {
        await this.subscriptionsQueue.addBulk(jobs);
        scheduled += jobs.length;
      }
      after = rows[rows.length - 1].id;
      if (rows.length < 500) break;
    }
    if (late > 0) {
      this.logger.warn(`trial reminders sent late by the sweep: ${late}`);
    }
    return { scheduled, late };
  }

  /** Test seam: run the reminder logic for one subscription now. */
  async runTrialReminderNow(subscriptionId: string): Promise<void> {
    await this.processSubscriptionJob({
      name: TRIAL_REMINDER_JOB,
      data: { subscriptionId },
    } as Job<{ subscriptionId: string }>);
  }
}

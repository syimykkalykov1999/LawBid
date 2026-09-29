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
  TRIAL_REMINDER_JOB,
} from './billing.constants';
import type { ProviderEvent } from './payment-provider';
import type { StripeWebhookJobData } from './stripe-webhook.intake';
import { SubscriptionSyncService } from './subscription-sync.service';

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
    const connection = { url };
    this.dlq = new Queue(STRIPE_WEBHOOKS_DLQ, { connection });
    this.workers.push(
      new Worker<StripeWebhookJobData>(
        STRIPE_WEBHOOKS_QUEUE,
        (job) => this.processWebhook(job),
        {
          connection,
          concurrency: 4,
        },
      ),
      new Worker<{ subscriptionId: string }>(
        SUBSCRIPTION_JOBS_QUEUE,
        (job) => this.processSubscriptionJob(job),
        {
          connection,
          concurrency: 2,
        },
      ),
    );
    for (const w of this.workers) {
      w.on('failed', (job, err) =>
        this.logger.warn(
          `${w.name} job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
        ),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      ...this.workers.map((w) => w.close()),
      this.dlq?.close(),
    ]).catch(() => undefined);
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
          `stripe event ${row.stripe_event_id} (${row.type}) moved to ${STRIPE_WEBHOOKS_DLQ}: ${String(e)}`,
        );
        await this.dlq?.add(
          'dead',
          { eventId: row.stripe_event_id, error: String(e) },
          { jobId: row.stripe_event_id },
        );
      }
      throw e;
    }
  }

  private async processSubscriptionJob(
    job: Job<{ subscriptionId: string }>,
  ): Promise<void> {
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

  /** Test seam: run the reminder logic for one subscription now. */
  async runTrialReminderNow(subscriptionId: string): Promise<void> {
    await this.processSubscriptionJob({
      name: TRIAL_REMINDER_JOB,
      data: { subscriptionId },
    } as Job<{ subscriptionId: string }>);
  }
}

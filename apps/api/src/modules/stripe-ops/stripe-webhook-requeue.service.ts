import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOKS_QUEUE } from '../billing/billing.constants';
import { HANDLED_STRIPE_EVENTS } from '../billing/billing.constants';
import type { StripeWebhookJobData } from '../billing/stripe-webhook.intake';
import { requeueStripeEvent } from '../billing/stripe-webhook.requeue';

const MIN_AGE_MS = 2 * 60_000;
const BATCH = 200;

/**
 * Stripe robustness: the intake stores the event first and queues it second.
 * If Redis was down in between (or a failover lost the job), the row stays
 * with processed_at null. `stripe-webhooks.requeue` (every minute) queues
 * every stored, handled, unprocessed event older than 2 minutes again
 * (idempotent: jobId = event id).
 */
@Injectable()
export class StripeWebhookRequeueService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StripeWebhookRequeueService.name);
  queue?: Pick<Queue<StripeWebhookJobData>, 'add' | 'getJob' | 'close'>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (url)
      this.queue = new Queue(STRIPE_WEBHOOKS_QUEUE, { connection: { url } });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
  }

  async sweep(now = new Date()): Promise<{ found: number; requeued: number }> {
    if (!this.queue) return { found: 0, requeued: 0 };
    const rows = await this.prisma.stripeWebhookEvent.findMany({
      where: {
        processed_at: null,
        created_at: { lt: new Date(now.getTime() - MIN_AGE_MS) },
        type: { in: [...HANDLED_STRIPE_EVENTS] },
      },
      select: { stripe_event_id: true },
      orderBy: { created_at: 'asc' },
      take: BATCH,
    });
    let requeued = 0;
    for (const r of rows) {
      try {
        if (await requeueStripeEvent(this.queue, r.stripe_event_id)) requeued++;
      } catch (e) {
        this.logger.warn(
          `requeue ${r.stripe_event_id} failed: ${(e as Error).message}`,
        );
      }
    }
    if (requeued > 0)
      this.logger.warn(
        `stripe webhook events requeued from the database: ${requeued}`,
      );
    return { found: rows.length, requeued };
  }
}

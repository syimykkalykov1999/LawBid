import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { bullOptions } from '../../redis/redis-connection';
import { PrismaService } from '../../prisma/prisma.service';
import { STRIPE_WEBHOOKS_QUEUE } from '../billing/billing.constants';
import { HANDLED_STRIPE_EVENTS } from '../billing/billing.constants';
import type { StripeWebhookJobData } from '../billing/stripe-webhook.intake';
import { requeueStripeEvent } from '../billing/stripe-webhook.requeue';

const MIN_AGE_MS = 2 * 60_000;
const BATCH = 200;
/** Rows looked at per run (5 keyset pages). */
const MAX_PER_RUN = 1000;

/**
 * Stripe robustness: the intake stores the event first and queues it second.
 * If Redis was down in between (or a failover lost the job), the row stays
 * with processed_at null. `stripe-webhooks.requeue` (every minute) queues
 * every stored, handled, unprocessed event older than 2 minutes again
 * (idempotent: jobId = event id).
 *
 * Perf review 2026-10-26 (R-35): the read uses the partial index
 * stripe_webhook_events_unprocessed_idx (created_at, stripe_event_id)
 * WHERE processed_at IS NULL, walks it by keyset pages of 200 (no OFFSET,
 * no rescan) and stops after 1 000 rows per run.
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
      this.queue = new Queue(
        STRIPE_WEBHOOKS_QUEUE,
        bullOptions(STRIPE_WEBHOOKS_QUEUE, url),
      );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
  }

  async sweep(now = new Date()): Promise<{ found: number; requeued: number }> {
    if (!this.queue) return { found: 0, requeued: 0 };
    const cutoff = new Date(now.getTime() - MIN_AGE_MS);
    let after: { created_at: Date; id: string } | null = null;
    let found = 0;
    let requeued = 0;
    while (found < MAX_PER_RUN) {
      const rows: { stripe_event_id: string; created_at: Date }[] =
        await this.prisma.stripeWebhookEvent.findMany({
          where: {
            processed_at: null,
            created_at: { lt: cutoff },
            type: { in: [...HANDLED_STRIPE_EVENTS] },
            ...(after
              ? {
                  OR: [
                    { created_at: { gt: after.created_at } },
                    {
                      created_at: after.created_at,
                      stripe_event_id: { gt: after.id },
                    },
                  ],
                }
              : {}),
          },
          select: { stripe_event_id: true, created_at: true },
          orderBy: [{ created_at: 'asc' }, { stripe_event_id: 'asc' }],
          take: BATCH,
        });
      found += rows.length;
      for (const r of rows) {
        try {
          if (await requeueStripeEvent(this.queue, r.stripe_event_id))
            requeued++;
        } catch (e) {
          this.logger.warn(
            `requeue ${r.stripe_event_id} failed: ${(e as Error).message}`,
          );
        }
      }
      if (rows.length < BATCH) break;
      const last = rows[rows.length - 1];
      after = { created_at: last.created_at, id: last.stripe_event_id };
    }
    if (requeued > 0)
      this.logger.warn(
        `stripe webhook events requeued from the database: ${requeued}`,
      );
    return { found, requeued };
  }
}

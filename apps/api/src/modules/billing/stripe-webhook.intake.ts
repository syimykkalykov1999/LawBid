import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HANDLED_STRIPE_EVENTS,
  PAYMENT_PROVIDER,
  STRIPE_WEBHOOK_JOB,
  STRIPE_WEBHOOKS_QUEUE,
  WEBHOOK_JOB_OPTS,
} from './billing.constants';
import type { PaymentProvider } from './payment-provider';
import { requeueStripeEvent } from './stripe-webhook.requeue';

export interface StripeWebhookJobData {
  eventId: string;
}

/** Verifies, stores (idempotently) and queues a webhook event. */
import { refreshProvider } from './dynamic-payment.provider';
@Injectable()
export class StripeWebhookIntakeService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StripeWebhookIntakeService.name);
  private queue?: Queue<StripeWebhookJobData>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
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

  /** Returns true when the event was new and queued. */
  async receive(
    rawBody: Buffer,
    signature: string | undefined,
    options: { connect?: boolean } = {},
  ): Promise<boolean> {
    await refreshProvider(this.provider);
    const event = this.provider.constructWebhookEvent(
      rawBody,
      signature,
      options,
    );
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          stripe_event_id: event.id,
          type: event.type,
          payload: event.object as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // A retry of an event stored earlier whose queue.add failed (Redis
        // down): re-queue it unless a live job exists.
        const stored = await this.prisma.stripeWebhookEvent.findUnique({
          where: { stripe_event_id: event.id },
          select: { processed_at: true },
        });
        if (
          stored &&
          !stored.processed_at &&
          HANDLED_STRIPE_EVENTS.has(event.type)
        ) {
          if (!this.queue)
            throw new Error(
              'stripe webhook queue is not available (REDIS_URL)',
            );
          const added = await requeueStripeEvent(this.queue, event.id);
          this.logger.warn(
            `stripe event ${event.id} was stored but unprocessed: ${added ? 're-queued' : 'a live job exists'}`,
          );
          return added;
        }
        this.logger.debug(`duplicate stripe event ${event.id} ignored`);
        return false;
      }
      throw e;
    }
    if (!HANDLED_STRIPE_EVENTS.has(event.type)) {
      await this.prisma.stripeWebhookEvent.update({
        where: { stripe_event_id: event.id },
        data: { processed_at: new Date() },
      });
      return false;
    }
    if (!this.queue)
      throw new Error('stripe webhook queue is not available (REDIS_URL)');
    await this.queue.add(
      STRIPE_WEBHOOK_JOB,
      { eventId: event.id },
      { ...WEBHOOK_JOB_OPTS, jobId: event.id },
    );
    return true;
  }
}

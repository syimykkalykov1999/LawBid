import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  OBSERVED_QUEUES,
  STRIPE_WEBHOOK_JOB,
  STRIPE_WEBHOOKS_DLQ,
  STRIPE_WEBHOOKS_QUEUE,
  WEBHOOK_JOB_OPTS,
} from '../../jobs/handlers/ops-metrics.job';
import { CRON_LANES } from '../../jobs/jobs.constants';
import { bullOptions } from '../../redis/redis-connection';

export interface QueueRetryResult {
  /** Failed jobs put back in their queues. */
  retried: number;
  /** Stripe events moved from the dead-letter queue back to processing. */
  stripeReplayed: number;
  /** Per queue: how many failed jobs were retried. */
  byQueue: Record<string, number>;
}

/** Most jobs one press retries per queue (the rest: press again). */
export const RETRY_LIMIT_PER_QUEUE = 200;

/**
 * S10-7: the admin replay tool. Exhausted jobs used to sit in each queue's
 * failed set and the Stripe DLQ was replayed by "tell Claude". BullMQ's own
 * `retryJobs` (docs.bullmq.io/guide/queues/ — "retry jobs") puts failed jobs
 * back; the Stripe dead letters are re-queued as fresh events (the stored
 * `stripe_webhook_events` row is the truth, the handler is idempotent).
 * Cron lanes are skipped: their schedule runs the job again anyway.
 */
@Injectable()
export class QueueAdminService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueAdminService.name);
  }

  async retryFailed(): Promise<QueueRetryResult> {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    const lanes = new Set<string>(CRON_LANES);
    const byQueue: Record<string, number> = {};
    let retried = 0;
    for (const name of OBSERVED_QUEUES) {
      if (name === STRIPE_WEBHOOKS_DLQ || lanes.has(name)) continue;
      const q = new Queue(name, bullOptions(name, url));
      try {
        const counts = await q.getJobCounts('failed');
        const n = Math.min(counts.failed ?? 0, RETRY_LIMIT_PER_QUEUE);
        if (n === 0) continue;
        await q.retryJobs({ state: 'failed', count: n });
        byQueue[name] = n;
        retried += n;
      } finally {
        await q.close();
      }
    }
    const stripeReplayed = await this.replayStripeDlq(url);
    this.logger.info(
      { retried, stripeReplayed, byQueue },
      'failed jobs retried',
    );
    return { retried, stripeReplayed, byQueue };
  }

  private async replayStripeDlq(url: string): Promise<number> {
    const dlq = new Queue(
      STRIPE_WEBHOOKS_DLQ,
      bullOptions(STRIPE_WEBHOOKS_DLQ, url),
    );
    const intake = new Queue(
      STRIPE_WEBHOOKS_QUEUE,
      bullOptions(STRIPE_WEBHOOKS_QUEUE, url),
    );
    try {
      const dead = await dlq.getJobs(
        ['waiting', 'delayed', 'completed', 'failed'],
        0,
        RETRY_LIMIT_PER_QUEUE - 1,
      );
      let replayed = 0;
      for (const job of dead) {
        const eventId = (job.data as { eventId?: string }).eventId;
        if (!eventId) continue;
        await intake.add(
          STRIPE_WEBHOOK_JOB,
          { eventId },
          {
            ...WEBHOOK_JOB_OPTS,
            // The original id may still sit in the failed set.
            jobId: `${eventId}-replay-${Date.now()}`,
          },
        );
        await job.remove();
        replayed++;
      }
      return replayed;
    } finally {
      await Promise.all([dlq.close(), intake.close()]);
    }
  }
}

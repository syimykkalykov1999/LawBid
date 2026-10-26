import type { Queue } from 'bullmq';
import { STRIPE_WEBHOOK_JOB, WEBHOOK_JOB_OPTS } from './billing.constants';
import type { StripeWebhookJobData } from './stripe-webhook.intake';

/**
 * Stripe robustness: puts a STORED but unprocessed webhook event back on the
 * queue (jobId = event id, so it is idempotent) ONLY when its job is missing
 * from Redis (lost after an outage or failover). Any existing job (waiting,
 * active, delayed, completed, or failed) is left alone: a failed one is owned
 * by the retry/DLQ logic in billing.runner.ts and must not be re-run.
 * Returns true when a job was added.
 */
export async function requeueStripeEvent(
  queue: Pick<Queue<StripeWebhookJobData>, 'add' | 'getJob'>,
  eventId: string,
): Promise<boolean> {
  if (await queue.getJob(eventId)) return false;
  await queue.add(
    STRIPE_WEBHOOK_JOB,
    { eventId },
    { ...WEBHOOK_JOB_OPTS, jobId: eventId },
  );
  return true;
}

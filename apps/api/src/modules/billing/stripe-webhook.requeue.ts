import type { Queue } from 'bullmq';
import { STRIPE_WEBHOOK_JOB, WEBHOOK_JOB_OPTS } from './billing.constants';
import type { StripeWebhookJobData } from './stripe-webhook.intake';

/**
 * Stripe robustness: puts a STORED but unprocessed webhook event back on the
 * queue (jobId = event id, so it is idempotent). A live job (waiting, active,
 * delayed) is left alone; a finished one (completed / failed) is replaced
 * because the stored row says the work was never recorded.
 * Returns true when a job was added.
 */
export async function requeueStripeEvent(
  queue: Pick<Queue<StripeWebhookJobData>, 'add' | 'getJob'>,
  eventId: string,
): Promise<boolean> {
  const existing = await queue.getJob(eventId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') return false;
    await existing.remove().catch(() => undefined);
  }
  await queue.add(
    STRIPE_WEBHOOK_JOB,
    { eventId },
    { ...WEBHOOK_JOB_OPTS, jobId: eventId },
  );
  return true;
}

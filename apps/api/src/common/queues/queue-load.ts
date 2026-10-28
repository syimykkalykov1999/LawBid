/**
 * S10-10: the number the worker service autoscales on.
 *
 * Research: AWS "Scaling policy based on Amazon SQS" (docs.aws.amazon.com/
 * autoscaling/ec2/userguide/as-using-sqs-queue.html, still current in
 * 2026): scale on "backlog per instance = queue depth × average seconds per
 * message" against an acceptable latency, not on the raw depth. A flat sum
 * counted 40 000 waiting fan-out batches like 40 000 waiting push sends.
 * BullMQ has no such metric of its own, so each queue gets a cost weight
 * (≈ seconds per job relative to a fast ~100 ms job) and an old queue head
 * adds pressure — wait time, the thing users feel.
 *
 * The CloudWatch metric keeps its name and meaning ("jobs of the normal
 * kind waiting"), so `worker_jobs_per_task = 50` and the alarms stay valid.
 */
import type { QueueMode } from './queue-mode';

export interface QueueLoadRow {
  queue: string;
  waiting: number;
  oldestAgeSeconds: number;
}

/** Relative cost of one job of the queue (1 = a fast sweep / webhook). */
export const QUEUE_COST_WEIGHT: Record<string, number> = {
  push: 0.5,
  'stripe-webhooks': 1,
  subscriptions: 1,
  'cron-fast': 1,
  cron: 1,
  'cron-heavy': 5,
  'case-fanout': 2,
  'channel-fanout': 3,
  'admin-broadcast': 3,
  files: 5,
  'media-moderation': 2,
  'data-export': 25,
  'case-history-export': 25,
  'deal-record': 5,
  'account-deletion': 15,
};

/** A queue head older than this starts to add pressure. */
const AGE_FREE_SECONDS = 120;
/** One extra minute of wait is worth this many normal jobs (= one task at
 * the default worker_jobs_per_task of 50). */
const PRESSURE_PER_MINUTE = 50;
const PRESSURE_CAP = 500;

/** Queues without a consumer (dead letters): never backlog. */
const NO_CONSUMER = new Set(['stripe-webhooks-dlq']);

export interface QueueLoad {
  /** The value published as QueueWaitingTotal. */
  signal: number;
  /** The old flat sum, logged next to it for comparison. */
  rawWaiting: number;
}

export function queueLoadSignal(
  rows: readonly QueueLoadRow[],
  mode: QueueMode,
): QueueLoad {
  let raw = 0;
  let weighted = 0;
  let pressure = 0;
  for (const r of rows) {
    if (NO_CONSUMER.has(r.queue)) continue;
    raw += r.waiting;
    const w = QUEUE_COST_WEIGHT[r.queue] ?? 1;
    weighted += r.waiting * w;
    if (r.waiting > 0 && r.oldestAgeSeconds > AGE_FREE_SECONDS) {
      pressure += Math.min(
        PRESSURE_CAP,
        ((r.oldestAgeSeconds - AGE_FREE_SECONDS) / 60) * PRESSURE_PER_MINUTE,
      );
    }
  }
  if (mode === 'off') return { signal: raw, rawWaiting: raw };
  const signal = mode === 'on' ? weighted : weighted + pressure;
  return { signal: Math.round(signal), rawWaiting: raw };
}

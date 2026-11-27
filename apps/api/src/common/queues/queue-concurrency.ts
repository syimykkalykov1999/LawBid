import type { AppSettingKey } from '../app-settings/app-settings.defaults';

/**
 * THIRD_PASS_A Q5 (26.11, owner rule 11 «every limit is an admin setting»):
 * how many jobs each queue worker runs at once in one process. Before, the
 * numbers were written in each runner (push 20, fan-outs 4, exports 2, …);
 * only the cron lanes read a setting (jobs.runner.ts, row 181). Same pattern
 * here: the worker starts with the built-in default, and every
 * QUEUE_CONCURRENCY_RECHECK_MS the value in admin Настройки is applied to
 * the running worker with BullMQ's own `worker.concurrency` setter
 * (docs.bullmq.io «Concurrency»: it can change while the worker runs; a
 * lower value only stops it taking new jobs until the running ones end).
 *
 * Owner 26.11: «лимиты … для меня вообще не ставь» — no ceiling. A value is
 * used when it is a whole number ≥ 1; anything else (0, a fraction, a read
 * error) keeps the default, so a typo never stops a queue.
 *
 * Not here on purpose: `group-fanout-<n>` keeps 1 per partition (the order
 * of a group's messages depends on it; its partition count is already the
 * setting `groups.fanout_partitions`).
 */
export const QUEUE_CONCURRENCY: Readonly<
  Record<string, { key: AppSettingKey; default: number }>
> = {
  'account-deletion': {
    key: 'ops.queue_concurrency_account_deletion',
    default: 2,
  },
  'admin-broadcast': {
    key: 'ops.queue_concurrency_admin_broadcast',
    default: 1,
  },
  'case-fanout': { key: 'ops.queue_concurrency_case_fanout', default: 4 },
  'case-history-export': {
    key: 'ops.queue_concurrency_case_history_export',
    default: 2,
  },
  'data-export': { key: 'ops.queue_concurrency_data_export', default: 2 },
  'deal-record': { key: 'ops.queue_concurrency_deal_record', default: 2 },
  files: { key: 'ops.queue_concurrency_files', default: 2 },
  'media-moderation': {
    key: 'ops.queue_concurrency_media_moderation',
    default: 4,
  },
  'post-fanout': { key: 'ops.queue_concurrency_post_fanout', default: 4 },
  push: { key: 'ops.queue_concurrency_push', default: 20 },
  'registry-checks': {
    key: 'ops.queue_concurrency_registry_checks',
    default: 4,
  },
  'stripe-webhooks': {
    key: 'ops.queue_concurrency_stripe_webhooks',
    default: 4,
  },
  subscriptions: { key: 'ops.queue_concurrency_subscriptions', default: 2 },
};

/** How often the running workers re-read their setting (like the cron
 * lanes' 30 s heartbeat). */
export const QUEUE_CONCURRENCY_RECHECK_MS = 30_000;

/** The built-in default of [queue] (the worker's starting value). */
export function queueConcurrency(queue: string): number {
  const entry = QUEUE_CONCURRENCY[queue];
  if (!entry) throw new Error(`no concurrency setting for queue ${queue}`);
  return entry.default;
}

/** A stored value → the concurrency to use: a whole number ≥ 1, no
 * ceiling (owner 26.11); anything else → [fallback]. */
export function resolveConcurrency(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1
    ? raw
    : fallback;
}

/** The part of a BullMQ Worker this needs (a fake in the specs). */
export interface ConcurrencyTarget {
  readonly name: string;
  concurrency: number;
  on(event: 'closed', listener: () => void): unknown;
}

const tracked = new Set<ConcurrencyTarget>();

/** Puts [worker] under its queue's setting (QueueConcurrencyService applies
 * it). A worker of a queue not listed in QUEUE_CONCURRENCY is left alone. */
export function trackConcurrency(worker: ConcurrencyTarget): void {
  if (!QUEUE_CONCURRENCY[worker?.name]) return;
  tracked.add(worker);
  worker.on('closed', () => tracked.delete(worker));
}

/** @internal the specs */
export function trackedWorkers(): ReadonlySet<ConcurrencyTarget> {
  return tracked;
}

/** @internal the specs */
export function resetTrackedForTest(): void {
  tracked.clear();
}

export interface ConcurrencyChange {
  queue: string;
  from: number;
  to: number;
}

/**
 * Reads each tracked queue's setting once and sets it on its workers.
 * Returns what changed. Never throws: a setting that cannot be read leaves
 * the worker as it is.
 */
export async function applyQueueConcurrency(
  read: (key: AppSettingKey) => Promise<unknown>,
): Promise<ConcurrencyChange[]> {
  const changes: ConcurrencyChange[] = [];
  const wanted = new Map<string, number>();
  for (const worker of tracked) {
    const entry = QUEUE_CONCURRENCY[worker.name];
    if (!entry) continue;
    let want = wanted.get(worker.name);
    if (want === undefined) {
      try {
        want = resolveConcurrency(await read(entry.key), entry.default);
      } catch {
        continue;
      }
      wanted.set(worker.name, want);
    }
    if (worker.concurrency === want) continue;
    changes.push({ queue: worker.name, from: worker.concurrency, to: want });
    worker.concurrency = want;
  }
  return changes;
}

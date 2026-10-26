/**
 * Shared BullMQ hardening (S10-8, S10-9, S10-11), one place for all workers.
 *
 * Research (docs.bullmq.io "Stalled jobs" and "Going to production",
 * checked 2026-10-25): a job is "stalled" when its lock is not renewed;
 * the lock is renewed every lockDuration/2 from the Node event loop, so a
 * handler that blocks the loop for longer than `lockDuration` (sharp, zip,
 * big JSON.stringify on a 0.5 vCPU task) looks dead and a second worker
 * re-runs it. The ready-made knobs are per-queue `lockDuration`,
 * `stalledInterval` and `maxStalledCount` — no custom code needed. On
 * SIGTERM BullMQ's `worker.close()` stops fetching and waits for active
 * jobs; AWS gives a Fargate Spot task 2 minutes (stopTimeout max 120 s),
 * so the wait must be bounded, not infinite.
 */
import type { MetricsOptions } from 'bullmq';
import type { QueueMode } from './queue-mode';

export interface WorkerTuning {
  lockDuration: number;
  stalledInterval: number;
  maxStalledCount: number;
  /** BullMQ's own per-minute completed/failed counters (docs.bullmq.io/
   * guide/metrics) — read by ops-metrics for the failed-job alarm (S10-7).
   * One hour of one-minute points is ~120 small Redis numbers per queue. */
  metrics: MetricsOptions;
}

const DEFAULT_TUNING: WorkerTuning = {
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
  // 60 one-minute points = BullMQ's MetricsTime.ONE_HOUR (a literal, so
  // specs that mock 'bullmq' need no enum).
  metrics: { maxDataPoints: 60 },
};

/**
 * Queues whose handlers are long or CPU-bound. Longer lock = a blocked
 * event loop is not mistaken for a dead worker; the price is that after a
 * REAL crash (Spot kill) the job is picked up again after the lock
 * expires, which is acceptable for exports/scans/deletions (they are
 * idempotent and re-claimable, see DataExportService.process).
 */
const TUNING: Record<string, Partial<Omit<WorkerTuning, 'metrics'>>> = {
  files: { lockDuration: 120_000, stalledInterval: 60_000, maxStalledCount: 2 },
  'data-export': {
    lockDuration: 300_000,
    stalledInterval: 60_000,
    maxStalledCount: 3,
  },
  'case-history-export': {
    lockDuration: 300_000,
    stalledInterval: 60_000,
    maxStalledCount: 3,
  },
  'account-deletion': {
    lockDuration: 180_000,
    stalledInterval: 60_000,
    maxStalledCount: 3,
  },
  'cron-heavy': {
    lockDuration: 300_000,
    stalledInterval: 60_000,
    maxStalledCount: 2,
  },
  'channel-fanout': { lockDuration: 90_000, stalledInterval: 60_000 },
  'case-fanout': { lockDuration: 90_000, stalledInterval: 60_000 },
  'admin-broadcast': { lockDuration: 90_000, stalledInterval: 60_000 },
  'media-moderation': { lockDuration: 60_000, maxStalledCount: 2 },
};

export function workerTuning(queue: string): WorkerTuning {
  return { ...DEFAULT_TUNING, ...(TUNING[queue] ?? {}) };
}

/** BullMQ fails a job that stalled more often than maxStalledCount with
 * this message, WITHOUT consuming a retry attempt — so `attemptsMade` is
 * lower than `attempts` and "last attempt" checks miss it. */
export function isStalledFailure(error: Error | undefined): boolean {
  return /stalled more than allowable limit/i.test(error?.message ?? '');
}

export function parseQueueMode(value: unknown): QueueMode {
  return value === 'off' || value === 'on' || value === 'auto' ? value : 'auto';
}

/**
 * Per-owner fairness inside a shared FIFO queue without BullMQ Pro groups:
 * the more jobs one owner already has pending, the larger (= lower
 * priority) the BullMQ priority of the next one, capped at +20. Nothing is
 * rejected; a flood from one account simply queues behind everyone else.
 * BullMQ priority: 1 is the highest.
 */
export function fairPriority(pending: number, base: number): number {
  const over = Math.max(0, pending - 5);
  return base + Math.min(20, Math.floor(over / 5));
}

/** Total time the process may spend draining workers after SIGTERM. A
 * Fargate task is SIGKILLed after stopTimeout (120 s max); leave room for
 * the Redis/Prisma shutdown that follows. */
const DEFAULT_DRAIN_BUDGET_MS = 95_000;
let drainDeadline: number | null = null;

export function resetDrainDeadlineForTests(): void {
  drainDeadline = null;
}

function drainBudgetMs(): number {
  const raw = Number(process.env.WORKER_DRAIN_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DRAIN_BUDGET_MS;
}

export type CloseResult = 'none' | 'drained' | 'timed-out';

/**
 * Stops the worker from taking NEW jobs at once (BullMQ close) and waits for
 * the active ones — but only until the shared process-wide deadline. Jobs
 * still running then are left to be reclaimed by BullMQ's stalled check
 * (their handlers are idempotent). All runners share one deadline, so ten
 * workers closing in a row cannot add up past the SIGKILL.
 */
export async function closeWorker(
  worker: { close: (force?: boolean) => Promise<void> } | undefined,
  budgetMs?: number,
): Promise<CloseResult> {
  if (!worker) return 'none';
  const now = Date.now();
  if (budgetMs === undefined) {
    drainDeadline ??= now + drainBudgetMs();
  }
  const wait = budgetMs ?? Math.max(1_000, (drainDeadline ?? now) - now);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), wait);
    timer.unref?.();
  });
  const drained = Promise.resolve()
    .then(() => worker.close())
    .catch(() => undefined)
    .then(() => 'drained' as const);
  try {
    return await Promise.race([drained, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Batch D (14.11): a background job that must stop — its lock was lost
 * (Redis restart / failover, BullMQ `lockRenewalFailed`), or it ran past its
 * time limit — stops at its next database call or checkpoint instead of
 * running on next to the second copy that already started.
 *
 * The pattern is BullMQ's own "Cancelling jobs" guide (docs.bullmq.io/guide/
 * workers/cancelling-jobs, BullMQ ≥ 5.6x, MIT): the processor receives an
 * `AbortSignal`, long work checks it and throws. Our ~110 cron handlers do
 * not take a signal parameter, so the signal travels with the job through
 * Node's AsyncLocalStorage (the way OpenTelemetry carries its context) and
 * is checked in one place — the Prisma query hook [jobStopExtension] — plus
 * explicit [throwIfJobStopped] calls in loops that catch errors per item.
 *
 * Stopping at the next query is the same as a crash of the worker at that
 * point, which every handler already survives (BullMQ stalled-job reclaim,
 * Fargate Spot kills): handlers are idempotent and transactions roll back.
 */
interface JobScope {
  signal: AbortSignal;
  /** False once the job settled (or its lock expired): a timer that a job
   * created and that outlives it must never be stopped by it. */
  live: boolean;
}

const scopes = new AsyncLocalStorage<JobScope>();

export class JobStoppedError extends Error {
  constructor(readonly reason: string) {
    super(`background job stopped: ${reason}`);
    this.name = 'JobStoppedError';
  }
}

/** The reason an AbortSignal carries, as text. */
export function abortReason(signal: AbortSignal): string {
  const r: unknown = signal.reason;
  if (r instanceof Error) return r.message;
  return typeof r === 'string' && r ? r : 'aborted';
}

/** Runs [fn] with [signal] as the current job's stop signal. Returns the
 * work and a `release` that ends the scope (call it when the work settled
 * or its lock is gone). */
export function runWithJobSignal<T>(
  signal: AbortSignal,
  fn: () => Promise<T>,
): { work: Promise<T>; release: () => void } {
  const scope: JobScope = { signal, live: true };
  const work = scopes.run(scope, fn);
  return {
    work,
    release: () => {
      scope.live = false;
    },
  };
}

/** The current job's stop signal (undefined outside a cron job). */
export function currentJobSignal(): AbortSignal | undefined {
  const s = scopes.getStore();
  return s?.live ? s.signal : undefined;
}

/** Throws [JobStoppedError] when the current job was told to stop. */
export function throwIfJobStopped(): void {
  const signal = currentJobSignal();
  if (signal?.aborted) throw new JobStoppedError(abortReason(signal));
}

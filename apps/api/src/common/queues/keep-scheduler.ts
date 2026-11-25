import type { Queue, RepeatOptions } from 'bullmq';

/** How often a kept scheduler is checked — the cron heartbeat's beat
 * (jobs.runner.ts `startHeartbeat`). */
export const KEEP_SCHEDULER_EVERY_MS = 30_000;

/**
 * Pack C (round 2 #11, 25.11): a BullMQ job scheduler lives only in
 * Redis. The cron schedules are re-checked every heartbeat (S6-1,
 * jobs.runner.ts `reconcileSchedules`); the two safety-net schedulers of
 * the billing and media-moderation runners were set once at boot, so a
 * Redis replacement stopped them until the next deploy. Same remedy:
 * upsert now, then check on every beat and put it back when missing
 * (`upsertJobScheduler` is idempotent per key, whatever the number of
 * processes). Returns the stop function.
 */
export function keepJobScheduler(
  queue: Pick<Queue, 'upsertJobScheduler' | 'getJobScheduler'>,
  key: string,
  repeat: Omit<RepeatOptions, 'key'>,
  template: Parameters<Queue['upsertJobScheduler']>[2],
  onError: (error: unknown) => void,
  everyMs = KEEP_SCHEDULER_EVERY_MS,
): () => void {
  const put = async () => {
    await queue.upsertJobScheduler(key, repeat, template);
  };
  const check = async () => {
    try {
      if (!(await queue.getJobScheduler(key))) await put();
    } catch (error) {
      onError(error);
    }
  };
  put().catch(onError);
  const timer = setInterval(() => void check(), everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

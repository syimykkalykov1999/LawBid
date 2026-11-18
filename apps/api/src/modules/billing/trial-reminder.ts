import { TRIAL_REMINDER_DAYS_BEFORE } from './billing.constants';

/**
 * S10-6: the BullMQ job of a trial-ending reminder — id and delay. ONE
 * function for the scheduler (SubscriptionsService) and the reconciler
 * (BillingRunner), so both agree on the job id and a re-add of an existing
 * job is a BullMQ no-op. Null once the reminder time has passed.
 */
/**
 * Verify batch 13 (Q4): the reminder job's retry and retention. With the
 * BullMQ default of ONE attempt a passing DB / Redis error failed it for
 * good, and the kept failed job (same id) blocked the hourly reconciler's
 * re-add, so the reminder only went out late, from the reconciler's
 * "missed" branch. Same retry shape as the webhook jobs.
 */
export const TRIAL_REMINDER_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: 100,
} as const;

export function trialReminderJob(
  row: { id: string; trial_ends_at: Date | null },
  nowMs: number = Date.now(),
): { jobId: string; delay: number } | null {
  if (!row.trial_ends_at) return null;
  const at =
    row.trial_ends_at.getTime() - TRIAL_REMINDER_DAYS_BEFORE * 86_400_000;
  const delay = at - nowMs;
  if (delay <= 0) return null;
  return { jobId: `trial-${row.id}-${row.trial_ends_at.getTime()}`, delay };
}

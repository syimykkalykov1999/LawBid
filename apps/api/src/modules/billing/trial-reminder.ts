import { TRIAL_REMINDER_DAYS_BEFORE } from './billing.constants';

/**
 * S10-6: the BullMQ job of a trial-ending reminder — id and delay. ONE
 * function for the scheduler (SubscriptionsService) and the reconciler
 * (BillingRunner), so both agree on the job id and a re-add of an existing
 * job is a BullMQ no-op. Null once the reminder time has passed.
 */
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

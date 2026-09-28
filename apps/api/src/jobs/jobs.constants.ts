/**
 * docs/06_PRODUCTION.md §6: separate BullMQ queues (`push`, `email`,
 * `moderation`, `search-index`, `counters`, `cron`). Periodic maintenance
 * lives on `cron`.
 */
export const CRON_QUEUE = 'cron';

export const CRON_JOBS = {
  /** docs/02 §6.4: "истёкшие сессии чистятся раз в сутки". */
  sessionsCleanup: 'sessions.cleanup',
  /** docs/02 §6.4 "Токены/сессии/OTP": OTP / rate-limit keys without TTL. */
  otpCleanup: 'otp.cleanup',
  /** docs/02 §3.3: disposable domains "обновляется джобой раз в месяц". */
  disposableDomainsRefresh: 'disposable-domains.refresh',
  /** docs/03 §7.3: one `review_requested` reminder after
   * review.reminder_after_days without a review. */
  reviewReminder: 'reviews.reminder',
  /** docs/03 §7.5: nightly reconciliation of attorney rating counters. */
  ratingReconcile: 'reviews.rating-reconcile',
  /** docs/03 §2.6: nightly license expiry + 30/7-day reminders. */
  licenseExpiry: 'licenses.expiry',
  /** docs/04 §2 (stage 4.4): safety-net withdrawal of an attorney's active
   * bids when SubscriptionAccessService.isActive() goes false. */
  bidSubscriptionLapse: 'bids.subscription-lapse',
} as const;

export type CronJobName = (typeof CRON_JOBS)[keyof typeof CRON_JOBS];

export interface CronSchedule {
  /** Job-scheduler id AND job name. Stable: every instance upserts the
   * same id, so N API/worker processes still yield one schedule. */
  readonly name: CronJobName;
  /** Cron pattern, evaluated in UTC. Off-peak, staggered. */
  readonly pattern: string;
}

export const CRON_SCHEDULES: readonly CronSchedule[] = [
  { name: CRON_JOBS.sessionsCleanup, pattern: '15 3 * * *' },
  { name: CRON_JOBS.otpCleanup, pattern: '45 3 * * *' },
  { name: CRON_JOBS.disposableDomainsRefresh, pattern: '30 4 1 * *' },
  // Daytime in the US (12:00 ET) — a reminder, not a 4 a.m. push.
  { name: CRON_JOBS.reviewReminder, pattern: '0 16 * * *' },
  { name: CRON_JOBS.ratingReconcile, pattern: '15 4 * * *' },
  // 05:05 UTC = just after midnight US Eastern: expires_at is a date, the
  // license lapses "в день окончания".
  { name: CRON_JOBS.licenseExpiry, pattern: '5 5 * * *' },
  // Hourly safety net (docs/04 §2, stage 4.4): usually a no-op once file
  // 06's subscription webhook calls withdrawActiveBidsForAttorney directly.
  { name: CRON_JOBS.bidSubscriptionLapse, pattern: '20 * * * *' },
];

export const DISPOSABLE_DOMAINS_FETCHER = Symbol('DISPOSABLE_DOMAINS_FETCHER');

/** Options token for JobsModule (scheduler/worker on or off). */
export const JOBS_OPTIONS = Symbol('JOBS_OPTIONS');

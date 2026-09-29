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
  /** docs/04 §10.2 (stage 4.6): hourly case lifecycle jobs. */
  caseStalePrompt: 'cases.stale-prompt',
  caseAutoArchive: 'cases.auto-archive',
  caseAutoClose: 'cases.auto-close',
  caseCompletionReminder: 'cases.completion-reminder',
  /** docs/05 stage 5.1: nightly counters reconcile. */
  countersReconcile: 'counters.reconcile',
  /** docs/05 §2.2.2: recommendations every 10 minutes. */
  feedReco: 'feed.reco',
  /** docs/05 §7.2: popular tags every 10 minutes. */
  trendingTags: 'search.trending-tags',
  /** docs/05 stage 5.8: notifications older than retention_days. */
  notificationsRetention: 'notifications.retention',
  /** docs/06 §5.1: anonymize accounts past the 14-day grace period. */
  privacyAnonymize: 'privacy.anonymize',
  /** docs/06 §5.3: monthly case_journal removal past retain_until. */
  journalRetention: 'journal.retention',
  /** docs/06 §5.3: daily hash-chain check of case_journal. */
  journalChainVerify: 'journal.chain-verify',
  /** docs/06 §5.3: expired export files. */
  exportsCleanup: 'exports.cleanup',
  /** docs/06 §8: queue depth / oldest job age → CloudWatch (log metric). */
  opsQueueMetrics: 'ops.queue-metrics',
  /** docs/06 §8: business counters for the Grafana dashboard. */
  opsBusinessMetrics: 'ops.business-metrics',
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
  // docs/04 §10.2 "каждый час", staggered within the hour.
  { name: CRON_JOBS.caseStalePrompt, pattern: '5 * * * *' },
  { name: CRON_JOBS.caseAutoArchive, pattern: '25 * * * *' },
  { name: CRON_JOBS.caseAutoClose, pattern: '35 * * * *' },
  { name: CRON_JOBS.caseCompletionReminder, pattern: '45 * * * *' },
  { name: CRON_JOBS.countersReconcile, pattern: '50 4 * * *' },
  { name: CRON_JOBS.feedReco, pattern: '*/10 * * * *' },
  { name: CRON_JOBS.trendingTags, pattern: '5-55/10 * * * *' },
  { name: CRON_JOBS.notificationsRetention, pattern: '40 4 * * *' },
  { name: CRON_JOBS.privacyAnonymize, pattern: '10 2 * * *' },
  { name: CRON_JOBS.journalRetention, pattern: '30 2 1 * *' },
  { name: CRON_JOBS.journalChainVerify, pattern: '50 2 * * *' },
  { name: CRON_JOBS.exportsCleanup, pattern: '10 3 * * *' },
  { name: CRON_JOBS.opsQueueMetrics, pattern: '* * * * *' },
  { name: CRON_JOBS.opsBusinessMetrics, pattern: '*/10 * * * *' },
];

export const DISPOSABLE_DOMAINS_FETCHER = Symbol('DISPOSABLE_DOMAINS_FETCHER');

/** Options token for JobsModule (scheduler/worker on or off). */
export const JOBS_OPTIONS = Symbol('JOBS_OPTIONS');

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
  /** Owner 2026-10-04: monthly re-check of licenses in registry states. */
  licenseRegistryRecheck: 'licenses.registry-recheck',
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
  /** OQ-041: unanswered calls → missed, abandoned ones → ended. */
  callsSweep: 'calls.sweep',
  /** Owner 2026-09-30: undecided client-review appeals → removed. */
  reviewAppealsSweep: 'review-appeals.sweep',
  /** Owner 2026-10-01: reels — expired uploads, stuck encodes, purges. */
  videosSweep: 'videos.sweep',
  /** Owner 2026-10-02: ended case promotions → finished; unpaid → canceled. */
  promotionsExpire: 'promotions.expire',
  /** Owner 2026-10-05: planner reminders (push at a task's remind_at). */
  taskReminders: 'tasks.reminders',
  /** Owner 2026-10-05: archived tasks past the retention → removed. */
  taskArchivePurge: 'tasks.archive-purge',
  /** Owner 2026-10-05: client → attorney checkouts never finished → canceled. */
  casePaymentsExpire: 'case-payments.expire',
  /** Owner 2026-10-05: payment-request reminders (due soon / overdue). */
  casePaymentsRemind: 'case-payments.remind',
  /** Owner 2026-10-05: partner commissions past their hold → approved,
   * monthly base accrued. */
  partnersSweep: 'partners.sweep',
  /** Owner 2026-10-06: country partners — finished months settled, held
   * shares sent to payroll, missed goals e-mailed to the owner. */
  countryPartnersSweep: 'country-partners.sweep',
  /** Owner 2026-10-05: demo accounts idle past the TTL are deleted; an
   * empty demo world is reseeded. */
  demoSweep: 'demo.sweep',
  /** Owner 2026-10-05: reminders before a case's date; date passed. */
  caseDeadlineReminder: 'cases.deadline-reminder',
  /** Owner 2026-10-05: support 24/7 — late answers flagged and escalated,
   * resolved tickets closed after N days. */
  supportSweep: 'support.sweep',
  /** Owner 2026-10-05: «Лучший сотрудник» of the finished period. */
  rewardsAward: 'rewards.award',
  /** Owner 2026-10-05: nightly safety net — attorney trust levels follow
   * the facts (registry flags, Stripe, decisions) even if a hook was missed. */
  trustRecompute: 'trust.recompute',
  /** Owner 2026-10-05 (legal): stale unconverted outreach leads deleted. */
  outreachRetention: 'outreach.retention',
  /** Owner 2026-10-05 (storage like Telegram): unused files and abandoned
   * uploads removed; old technical logs trimmed; a daily usage snapshot
   * with the growth alert. */
  storageCleanup: 'storage.gc',
  storageRetention: 'storage.retention',
  storageSnapshot: 'storage.snapshot',
  /** Owner 2026-10-05: client fraud — re-score the queue, propagate fresh
   * blocks to linked accounts, delete old hashes (retention). */
  fraudSweep: 'fraud.sweep',
  /** Owner 2026-10-05 zero maintenance: DB probe + auto pause of heavy jobs. */
  opsGuard: 'ops.guard',
  /** AWS spend vs the monthly budget; scale to the minimum at 100 %. */
  opsCostCheck: 'ops.cost-check',
  /** Newest CockroachDB Cloud backup is fresh. */
  opsBackupCheck: 'ops.backup-check',
  /** Owner 2026-10-05: spend caps in mode «Авто» follow real usage
   * (CostAutoscaleService). */
  costAutoscale: 'cost.autoscale',
  /** Owner 2026-10-05 «Прибыль и резерв»: payout statuses, a change of the
   * banks in Stripe, and the monthly split on its payout day. */
  treasuryDaily: 'treasury.daily',
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
  // Monthly, the 2nd at 06:20 UTC (off-peak for the registry).
  { name: CRON_JOBS.licenseRegistryRecheck, pattern: '20 6 2 * *' },
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
  { name: CRON_JOBS.callsSweep, pattern: '* * * * *' },
  { name: CRON_JOBS.reviewAppealsSweep, pattern: '40 * * * *' },
  { name: CRON_JOBS.videosSweep, pattern: '* * * * *' },
  { name: CRON_JOBS.promotionsExpire, pattern: '2-57/5 * * * *' },
  { name: CRON_JOBS.taskReminders, pattern: '* * * * *' },
  // 16:20 UTC: notices arrive in the US daytime.
  { name: CRON_JOBS.taskArchivePurge, pattern: '20 16 * * *' },
  { name: CRON_JOBS.casePaymentsExpire, pattern: '7-57/10 * * * *' },
  // 15:00 UTC ≈ 08:00 Pacific / 11:00 Eastern: a morning reminder.
  { name: CRON_JOBS.casePaymentsRemind, pattern: '0 15 * * *' },
  { name: CRON_JOBS.partnersSweep, pattern: '20 3 * * *' },
  // 04:25 UTC daily: the 1st settles the month just finished.
  { name: CRON_JOBS.countryPartnersSweep, pattern: '25 4 * * *' },
  { name: CRON_JOBS.demoSweep, pattern: '7 * * * *' },
  // 15:10 UTC = morning across the US: a reminder, not a night push.
  { name: CRON_JOBS.caseDeadlineReminder, pattern: '10 15 * * *' },
  { name: CRON_JOBS.supportSweep, pattern: '1-56/5 * * * *' },
  // 14:30 UTC ≈ 07:30 Pacific: the day after a period ends.
  { name: CRON_JOBS.rewardsAward, pattern: '30 14 * * *' },
  { name: CRON_JOBS.trustRecompute, pattern: '45 3 * * *' },
  { name: CRON_JOBS.outreachRetention, pattern: '25 3 * * *' },
  { name: CRON_JOBS.storageCleanup, pattern: '17 * * * *' },
  { name: CRON_JOBS.storageRetention, pattern: '35 4 * * *' },
  { name: CRON_JOBS.storageSnapshot, pattern: '55 4 * * *' },
  { name: CRON_JOBS.fraudSweep, pattern: '55 3 * * *' },
  { name: CRON_JOBS.opsGuard, pattern: '* * * * *' },
  { name: CRON_JOBS.opsCostCheck, pattern: '7 * * * *' },
  { name: CRON_JOBS.opsBackupCheck, pattern: '12 * * * *' },
  { name: CRON_JOBS.costAutoscale, pattern: '17 * * * *' },
  // 15:40 UTC ≈ 08:40 Pacific: a weekday-morning payout starts that day.
  { name: CRON_JOBS.treasuryDaily, pattern: '40 15 * * *' },
];

export const DISPOSABLE_DOMAINS_FETCHER = Symbol('DISPOSABLE_DOMAINS_FETCHER');

/** Options token for JobsModule (scheduler/worker on or off). */
export const JOBS_OPTIONS = Symbol('JOBS_OPTIONS');

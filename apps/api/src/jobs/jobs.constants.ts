/**
 * docs/06_PRODUCTION.md §6: separate BullMQ queues (`push`, `email`,
 * `moderation`, `search-index`, `counters`, `cron`). Periodic maintenance
 * lives on `cron`.
 */
export const CRON_QUEUE = 'cron';
/**
 * S10-2 (queues hardening, 2026-10-25): the schedules run on THREE lanes of
 * the same kind, each with its own BullMQ worker, so one slow job cannot
 * hold the others. Research: BullMQ docs "Queues" / "Going to production"
 * and the way Sidekiq/Stripe split queues by latency class (a `critical`
 * lane for signals, a `low`/`bulk` lane for long jobs); BullMQ has no
 * per-job-name concurrency, separate queues are its ready-made answer.
 * - `cron-fast`: every-minute SIGNAL and sweep jobs (queue metrics that
 *   drive worker autoscaling and the backlog alarm, ops guard, calls);
 * - `cron`: everything else (kept as the default lane and the old name,
 *   so a rolling deploy finds the same queue);
 * - `cron-heavy`: long DB/CPU jobs (recommendations, re-encryption,
 *   retention, anonymization, reconciles).
 */
export const CRON_FAST_QUEUE = 'cron-fast';
export const CRON_HEAVY_QUEUE = 'cron-heavy';
export const CRON_LANES = [
  CRON_FAST_QUEUE,
  CRON_QUEUE,
  CRON_HEAVY_QUEUE,
] as const;
export type CronLane = (typeof CRON_LANES)[number];

/** Parallel jobs per lane and process. Fast: independent short sweeps
 * (each also guarded by a per-name lock); default/heavy stay one at a
 * time so the database sees at most 5 maintenance statements per task. */
export const CRON_LANE_CONCURRENCY: Record<CronLane, number> = {
  [CRON_FAST_QUEUE]: 3,
  [CRON_QUEUE]: 1,
  [CRON_HEAVY_QUEUE]: 1,
};

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
  /** Owner 2026-10-16: an attorney who lost verification stops paying. */
  verificationLossBilling: 'billing.verification-loss',
  /** docs/04 §10.2 (stage 4.6): hourly case lifecycle jobs. */
  caseStaleAsk: 'cases.stale-ask',
  caseStalePause: 'cases.stale-pause',
  caseAutoClose: 'cases.auto-close',
  caseCompletionReminder: 'cases.completion-reminder',
  /** docs/05 stage 5.1: nightly counters reconcile. */
  countersReconcile: 'counters.reconcile',
  /** docs/05 §2.2.2: recommendations every 10 minutes. */
  feedReco: 'feed.reco',
  /** docs/05 §7.2: popular tags every 10 minutes. */
  trendingTags: 'search.trending-tags',
  /** Owner 2026-10-15: nightly "query → topic" learning from clicks. */
  searchLearn: 'search.learn',
  /** Owner 2026-10-15: topics of texts that name none (every 5 minutes). */
  searchTagTopics: 'search.tag-topics',
  /** Owner 2026-10-24: search-engine outbox → engine (off = prune only). */
  searchIndex: 'search.index',
  /** Owner 2026-10-25: experiment reports, guardrails, ranking_events partitions. */
  experimentsMetrics: 'experiments.metrics',
  /** Day-one foundations: nightly money-ledger checks + Stripe comparison. */
  ledgerReconcile: 'ledger.reconcile',
  /** DB-ops hardening: daily table size / dead-tuple ratio / txid age → log metrics. */
  dbHealth: 'db.health',
  /** Owner 2026-10-15: crash reports older than 30 days go. */
  crashesPurge: 'crashes.purge',
  /** docs/05 stage 5.8: notifications older than retention_days. */
  notificationsRetention: 'notifications.retention',
  /** docs/06 §5.1: anonymize accounts past the 14-day grace period. */
  privacyAnonymize: 'privacy.anonymize',
  /** docs/06 §5.3: monthly case_journal removal past retain_until. */
  journalRetention: 'journal.retention',
  /** docs/06 §5.3: daily hash-chain check of case_journal. */
  journalChainVerify: 'journal.chain-verify',
  /** Owner 2026-10-20: one government-request archive per tick + expired files. */
  legalExports: 'legal.exports',
  /** Owner 2026-10-20: deleted content past 90 days is scrubbed (holds skip). */
  legalRetention: 'legal.retention',
  /** docs/06 §5.3: expired export files. */
  exportsCleanup: 'exports.cleanup',
  /** docs/06 §8: queue depth / oldest job age → CloudWatch (log metric). */
  opsQueueMetrics: 'ops.queue-metrics',
  /** docs/06 §8: business counters for the Grafana dashboard. */
  opsBusinessMetrics: 'ops.business-metrics',
  /** Owner 2026-10-21: disappearing messages past expires_at → deleted. */
  disappearingSweep: 'chat.disappearing',
  /** OQ-041: unanswered calls → missed, abandoned ones → ended. */
  callsSweep: 'calls.sweep',
  /** S1-3: 1:1 messages whose live event / badge / push died after commit. */
  chatRedeliver: 'chat.redeliver',
  /** Owner 2026-09-30: undecided client-review appeals → removed. */
  reviewAppealsSweep: 'review-appeals.sweep',
  /** Owner 2026-10-01: reels — expired uploads, stuck encodes, purges. */
  videosSweep: 'videos.sweep',
  /** Owner 2026-10-02: ended case promotions → finished; unpaid → canceled. */
  promotionsExpire: 'promotions.expire',
  /** Owner 2026-10-20: stars top-ups whose webhook was lost → credited. */
  starsSweep: 'stars.sweep',
  /** Owner 2026-10-05: planner reminders (push at a task's remind_at). */
  taskReminders: 'tasks.reminders',
  /** Owner 2026-10-20: consultations — expiry, reminders, ticked off. */
  consultationsSweep: 'consultations.sweep',
  /** Owner 2026-10-21: Q&A — close unanswered after 30 days, purge deleted after 90. */
  legalQaSweep: 'legal-qa.sweep',
  /** Owner 2026-10-22: "X from your contacts joined LawBid" (server-side). */
  contactsJoined: 'contacts.joined',
  /** Security research #5 (2026-10-22), A7: re-hash the phone-book rows
   * written before CONTACTS_PEPPER (batches of 2000, until none is left). */
  contactsPepperBackfill: 'contacts.pepper-backfill',
  /** Owner 2026-10-22 (SECURITY_TODO): rewrite `enc:v2` / retired-kid
   * message bodies as `enc:v3` under the active key (resumable batches). */
  messagesReencrypt: 'messages.reencrypt',
  /** BUG-1 (package N-12b): blind search tokens for the messages written
   * before the index existed (or under an older SEARCH_INDEX_KEY). */
  chatSearchBackfill: 'chat.search-backfill',
  /** Owner 2026-10-05: archived tasks past the retention → removed. */
  taskArchivePurge: 'tasks.archive-purge',
  /** Owner 2026-10-05: client → attorney checkouts never finished → canceled. */
  casePaymentsExpire: 'case-payments.expire',
  /** Owner 2026-10-05: payment-request reminders (due soon / overdue). */
  casePaymentsRemind: 'case-payments.remind',
  /** Owner 2026-10-25: invoice overdue / late fee / reminders and signing
   * request expiry / reminders. */
  caseToolsSweep: 'case-tools.sweep',
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
  /** Owner 2026-10-22: «Состояние системы» watchdog — opens / closes
   * incidents and alerts the on-call admins. */
  statusWatchdog: 'ops.status-watchdog',
  /** Batch C items 11 and 16: daily Cloudflare Realtime and Bunny usage. */
  usagePoll: 'ops.usage-poll',
  /** AWS spend vs the monthly budget; scale to the minimum at 100 %. */
  opsCostCheck: 'ops.cost-check',
  /** Newest database backup (provider API) is fresh. */
  opsBackupCheck: 'ops.backup-check',
  /** Owner 2026-10-05: spend caps in mode «Авто» follow real usage
   * (CostAutoscaleService). */
  costAutoscale: 'cost.autoscale',
  /** Owner 2026-10-16 «Экономика»: third-party spend vs the rule, the
   * autoscaling ceiling, database / Redis load (EconomyService.tick). */
  economyGuard: 'economy.guard',
  /** Owner 2026-10-05 «Прибыль и резерв»: payout statuses, a change of the
   * banks in Stripe, and the monthly split on its payout day. */
  treasuryDaily: 'treasury.daily',
  /** Owner 2026-10-23 (admin economy pass): the admin's heavy aggregates
   * (dashboard, billing overview, trust scan) counted once into Redis. */
  adminSummaries: 'admin.summaries',
  // Shard-ready step 7: the cross-family outbox relay.
  outboxSweep: 'outbox.sweep',
  /** Events pipeline (N-2): auto signal, stream relay, retention. */
  eventsMaintain: 'events.maintain',
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
  { name: CRON_JOBS.verificationLossBilling, pattern: '*/10 * * * *' },
  // docs/04 §10.2 "каждый час", staggered within the hour.
  { name: CRON_JOBS.caseStaleAsk, pattern: '5 * * * *' },
  { name: CRON_JOBS.caseStalePause, pattern: '25 * * * *' },
  { name: CRON_JOBS.caseAutoClose, pattern: '35 * * * *' },
  { name: CRON_JOBS.caseCompletionReminder, pattern: '45 * * * *' },
  { name: CRON_JOBS.countersReconcile, pattern: '50 4 * * *' },
  { name: CRON_JOBS.feedReco, pattern: '*/10 * * * *' },
  { name: CRON_JOBS.trendingTags, pattern: '5-55/10 * * * *' },
  { name: CRON_JOBS.searchLearn, pattern: '30 3 * * *' },
  { name: CRON_JOBS.searchTagTopics, pattern: '3-58/5 * * * *' },
  { name: CRON_JOBS.searchIndex, pattern: '* * * * *' },
  // 02:20 UTC: after a full UTC day of events, before the US morning.
  { name: CRON_JOBS.experimentsMetrics, pattern: '20 2 * * *' },
  { name: CRON_JOBS.crashesPurge, pattern: '40 3 * * *' },
  { name: CRON_JOBS.notificationsRetention, pattern: '40 4 * * *' },
  { name: CRON_JOBS.privacyAnonymize, pattern: '10 2 * * *' },
  { name: CRON_JOBS.journalRetention, pattern: '30 2 1 * *' },
  { name: CRON_JOBS.journalChainVerify, pattern: '50 2 * * *' },
  { name: CRON_JOBS.exportsCleanup, pattern: '10 3 * * *' },
  { name: CRON_JOBS.legalExports, pattern: '* * * * *' },
  { name: CRON_JOBS.legalRetention, pattern: '20 3 * * *' },
  { name: CRON_JOBS.opsQueueMetrics, pattern: '* * * * *' },
  { name: CRON_JOBS.opsBusinessMetrics, pattern: '*/10 * * * *' },
  { name: CRON_JOBS.callsSweep, pattern: '* * * * *' },
  { name: CRON_JOBS.disappearingSweep, pattern: '*/2 * * * *' },
  { name: CRON_JOBS.chatRedeliver, pattern: '* * * * *' },
  { name: CRON_JOBS.reviewAppealsSweep, pattern: '40 * * * *' },
  { name: CRON_JOBS.videosSweep, pattern: '* * * * *' },
  { name: CRON_JOBS.promotionsExpire, pattern: '2-57/5 * * * *' },
  { name: CRON_JOBS.starsSweep, pattern: '1-58/3 * * * *' },
  { name: CRON_JOBS.taskReminders, pattern: '* * * * *' },
  { name: CRON_JOBS.consultationsSweep, pattern: '* * * * *' },
  { name: CRON_JOBS.legalQaSweep, pattern: '50 3 * * *' },
  { name: CRON_JOBS.contactsJoined, pattern: '1-59/2 * * * *' },
  { name: CRON_JOBS.contactsPepperBackfill, pattern: '3-58/5 * * * *' },
  { name: CRON_JOBS.messagesReencrypt, pattern: '4-59/5 * * * *' },
  // Every 5 minutes; «Авто» works only at night (UTC 06–12) until done.
  { name: CRON_JOBS.chatSearchBackfill, pattern: '1-56/5 * * * *' },
  // 16:20 UTC: notices arrive in the US daytime.
  { name: CRON_JOBS.taskArchivePurge, pattern: '20 16 * * *' },
  { name: CRON_JOBS.casePaymentsExpire, pattern: '7-57/10 * * * *' },
  // Hourly: each client is reminded in their own morning (09:00–21:00
  // local), so a missed run is caught up the same day.
  { name: CRON_JOBS.casePaymentsRemind, pattern: '0 * * * *' },
  { name: CRON_JOBS.caseToolsSweep, pattern: '30 6 * * *' },
  { name: CRON_JOBS.partnersSweep, pattern: '20 3 * * *' },
  // 04:25 UTC daily: the 1st settles the month just finished.
  { name: CRON_JOBS.countryPartnersSweep, pattern: '25 4 * * *' },
  { name: CRON_JOBS.demoSweep, pattern: '7 * * * *' },
  // Hourly: each person is reminded in their own morning (09:00–21:00
  // local), so a missed run is caught up the same day.
  { name: CRON_JOBS.caseDeadlineReminder, pattern: '10 * * * *' },
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
  { name: CRON_JOBS.statusWatchdog, pattern: '* * * * *' },
  // 06:25 UTC daily (the providers' stats lag by hours).
  { name: CRON_JOBS.usagePoll, pattern: '25 6 * * *' },
  { name: CRON_JOBS.opsCostCheck, pattern: '7 * * * *' },
  { name: CRON_JOBS.opsBackupCheck, pattern: '12 * * * *' },
  { name: CRON_JOBS.costAutoscale, pattern: '17 * * * *' },
  { name: CRON_JOBS.economyGuard, pattern: '*/5 * * * *' },
  // 15:40 UTC ≈ 08:40 Pacific: a weekday-morning payout starts that day.
  { name: CRON_JOBS.treasuryDaily, pattern: '40 15 * * *' },
  // Nightly, after Stripe has settled the previous day (UTC).
  { name: CRON_JOBS.ledgerReconcile, pattern: '15 5 * * *' },
  // Daily, off the busy hours: read-only statistics of every database.
  { name: CRON_JOBS.dbHealth, pattern: '35 4 * * *' },
  // Every second minute: a 1-minute cron would hold consecutive runs.
  { name: CRON_JOBS.adminSummaries, pattern: '*/2 * * * *' },
  // Every minute: applies cross-family events a request could not (retries
  // with backoff, dead letter); a no-op while there is one database.
  { name: CRON_JOBS.outboxSweep, pattern: '* * * * *' },
  // Events pipeline: every 5 minutes; a no-op unless auto / stream, prunes hourly.
  { name: CRON_JOBS.eventsMaintain, pattern: '*/5 * * * *' },
];

const FAST_JOBS: readonly CronJobName[] = [
  CRON_JOBS.opsQueueMetrics,
  CRON_JOBS.opsGuard,
  CRON_JOBS.statusWatchdog,
  CRON_JOBS.callsSweep,
  CRON_JOBS.outboxSweep,
  CRON_JOBS.taskReminders,
  CRON_JOBS.consultationsSweep,
  CRON_JOBS.videosSweep,
];

const HEAVY_JOBS: readonly CronJobName[] = [
  CRON_JOBS.feedReco,
  CRON_JOBS.messagesReencrypt,
  CRON_JOBS.countersReconcile,
  CRON_JOBS.ratingReconcile,
  CRON_JOBS.trustRecompute,
  CRON_JOBS.licenseRegistryRecheck,
  CRON_JOBS.opsBusinessMetrics,
  CRON_JOBS.adminSummaries,
  CRON_JOBS.legalExports,
  CRON_JOBS.legalRetention,
  CRON_JOBS.privacyAnonymize,
  CRON_JOBS.journalChainVerify,
  CRON_JOBS.journalRetention,
  CRON_JOBS.ledgerReconcile,
  CRON_JOBS.storageSnapshot,
  CRON_JOBS.storageRetention,
  CRON_JOBS.fraudSweep,
  CRON_JOBS.searchLearn,
  CRON_JOBS.usagePoll,
  CRON_JOBS.contactsPepperBackfill,
  CRON_JOBS.treasuryDaily,
];

export function cronLaneOf(name: string): CronLane {
  if ((FAST_JOBS as readonly string[]).includes(name)) return CRON_FAST_QUEUE;
  if ((HEAVY_JOBS as readonly string[]).includes(name)) return CRON_HEAVY_QUEUE;
  return CRON_QUEUE;
}

/**
 * S10-13: a schedule that fires more often than hourly is its own retry
 * (the next tick runs in a minute), so BullMQ must not ALSO retry it with
 * a 60 s backoff — that piled duplicate runs of a failing sweep behind
 * newer ticks. Kubernetes CronJob `concurrencyPolicy: Forbid` / Quartz
 * misfire "do nothing" are the same idea. Hourly and slower jobs keep
 * their 3 attempts.
 */
export function isSubHourly(pattern: string): boolean {
  const [minute, hour] = pattern.trim().split(/\s+/);
  return (
    hour === '*' && ((minute?.includes('*') || minute?.includes('/')) ?? false)
  );
}

export const DISPOSABLE_DOMAINS_FETCHER = Symbol('DISPOSABLE_DOMAINS_FETCHER');

/** Options token for JobsModule (scheduler/worker on or off). */
export const JOBS_OPTIONS = Symbol('JOBS_OPTIONS');

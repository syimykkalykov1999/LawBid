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
  /** docs/03 §2.6: nightly license expiry + 30/7-day reminders. */
  licenseExpiry: 'licenses.expiry',
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
  // 05:05 UTC = just after midnight US Eastern: expires_at is a date, the
  // license lapses "в день окончания".
  { name: CRON_JOBS.licenseExpiry, pattern: '5 5 * * *' },
];

export const DISPOSABLE_DOMAINS_FETCHER = Symbol('DISPOSABLE_DOMAINS_FETCHER');

/** Options token for JobsModule (scheduler/worker on or off). */
export const JOBS_OPTIONS = Symbol('JOBS_OPTIONS');

import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  CRON_JOBS,
  CRON_HEAVY_QUEUE,
  CRON_SCHEDULES,
  cronLaneOf,
  isSubHourly,
} from './jobs.constants';
import { withJobLock } from './handlers/job-lock';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CasePaymentsService } from '../modules/case-payments/case-payments.service';
import { PromotionsService } from '../modules/promotions/promotions.service';
import { StarsService } from '../modules/stars/stars.service';
import { PartnersService } from '../modules/partners/partners.service';
import { CountryPartnersService } from '../modules/country-partners/country-partners.service';
import { RewardsService } from '../modules/rewards/rewards.service';
import { SupportDeskService } from '../modules/support/support-desk.service';
import { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import { OtpCleanupJob } from './handlers/otp-cleanup.job';
import { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import { ReviewReminderJob } from './handlers/review-reminder.job';
import { RatingReconcileJob } from './handlers/rating-reconcile.job';
import { LicenseExpiryJob } from './handlers/license-expiry.job';
import { LicenseRegistryRecheckJob } from './handlers/license-registry-recheck.job';
import { BidSubscriptionLapseJob } from './handlers/bid-subscription-lapse.job';
import { VerificationLossBillingJob } from './handlers/verification-loss-billing.job';
import {
  CaseStalePauseJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStaleAskJob,
} from './handlers/case-lifecycle.jobs';
import { CaseDeadlineReminderJob } from './handlers/case-deadline-reminder.job';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';
import { CrashReportsService } from '../modules/crash-reports/crash-reports.service';
import { SearchLogService } from '../modules/search/search-log.service';
import { SearchSynonymsService } from '../modules/search/search-synonyms.service';
import { TrendingTagsJob } from '../modules/search/trending-tags.job';
import { NotificationsRetentionJob } from './handlers/notifications-retention.job';
import { OpsMetricsJob } from './handlers/ops-metrics.job';
import { AdminSummariesJob } from './handlers/admin-summaries.job';
import { CrossFamilyOutbox } from '../sharding/outbox/cross-family-outbox';
import { SearchIndexJob } from './handlers/search-index.job';
import { ExperimentsNightlyJob } from '../modules/experiments/experiments-nightly.job';
import { LedgerReconcileJob } from './handlers/ledger-reconcile.job';
import { DbHealthJob } from './handlers/db-health.job';
import { OpsGuardJob } from './handlers/ops-guard.job';
import { StatusWatchdogJob } from './handlers/status-watchdog.job';
import { LegalRemindersJob } from './handlers/legal-reminders.job';
import { UsagePollJob } from './handlers/usage-poll.job';
import { HEAVY_CRON_JOBS } from '../common/ops/ops.constants';
import { OpsStateService } from '../common/ops/ops-state.service';
import { LegalQaSweepJob } from '../modules/legal-qa/legal-qa-sweep.job';
import { ContactsJoinedJob } from './handlers/contacts-joined.job';
import { ContactsPepperBackfillJob } from './handlers/contacts-pepper-backfill.job';
import { MessageReencryptJob } from './handlers/message-reencrypt.job';
import { ChatSearchBackfillJob } from './handlers/chat-search-backfill.job';
import { ConsultationRemindersJob } from '../modules/consultations/consultation-reminders.job';
import {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from './handlers/tasks-planner.jobs';
import { CallsService } from '../modules/calls/calls.service';
import { PostVideosService } from '../modules/posts/post-videos.service';
import { ClientReviewsService } from '../modules/client-reviews/client-reviews.service';
import { AccountAnonymizationService } from '../modules/privacy/account-anonymization.service';
import { AccountDeletionRunner } from '../modules/privacy/account-deletion.runner';
import { LegalExportBuilder } from '../modules/admin-data-requests/legal-export.builder';
import { LegalRetentionService } from '../modules/admin-data-requests/legal-retention.service';
import { ExportsCleanupService } from '../modules/privacy/exports-cleanup.service';
import { JournalIntegrityService } from '../modules/privacy/journal-integrity.service';
import { AttorneyTrustService } from '../modules/attorney-trust/attorney-trust.service';
import { ClientFraudService } from '../modules/client-fraud/client-fraud.service';
import { JournalRetentionService } from '../modules/privacy/journal-retention.service';
import { DeletionNoticesService } from '../modules/privacy/deletion-notices.service';
import { PrivacyRetentionService } from '../modules/privacy/privacy-retention.service';
import { PrivacyReconcileJob } from './handlers/privacy-reconcile.job';
import { CostAutoscaleService } from '../common/cost-guard/cost-autoscale.service';
import { OutreachRetentionService } from '../modules/outreach/outreach-retention.service';
import { DemoService } from '../modules/demo/demo.service';
import { StorageCleanupService } from '../modules/storage/storage-cleanup.service';
import { DataRetentionService } from '../modules/storage/data-retention.service';
import { StorageStatsService } from '../modules/storage/storage-stats.service';
import { EconomyService } from '../common/economy/economy.service';
import { ChatService } from '../modules/chat/chat.service';
import { DisappearingSweepService } from '../modules/chat/disappearing-sweep.service';
import { TreasuryService } from '../modules/treasury/treasury.service';

/** Routes a `cron` queue job to its handler by job name. The return value
 * becomes the BullMQ job's `returnvalue` (visible in queue dashboards). */
@Injectable()
export class CronProcessor {
  constructor(
    private readonly sessionsCleanup: SessionsCleanupJob,
    private readonly otpCleanup: OtpCleanupJob,
    private readonly disposableRefresh: DisposableDomainsRefreshJob,
    private readonly reviewReminder: ReviewReminderJob,
    private readonly ratingReconcile: RatingReconcileJob,
    private readonly licenseExpiry: LicenseExpiryJob,
    private readonly licenseRegistryRecheck: LicenseRegistryRecheckJob,
    private readonly bidSubscriptionLapse: BidSubscriptionLapseJob,
    private readonly verificationLossBilling: VerificationLossBillingJob,
    private readonly caseStaleAsk: CaseStaleAskJob,
    private readonly caseStalePause: CaseStalePauseJob,
    private readonly caseAutoClose: CaseAutoCloseJob,
    private readonly caseCompletionReminder: CaseCompletionReminderJob,
    private readonly countersReconcile: CountersReconcileJob,
    private readonly feedReco: FeedRecoJob,
    private readonly trendingTags: TrendingTagsJob,
    private readonly notificationsRetention: NotificationsRetentionJob,
    private readonly anonymization: AccountAnonymizationService,
    private readonly journalRetention: JournalRetentionService,
    private readonly journalIntegrity: JournalIntegrityService,
    private readonly exportsCleanup: ExportsCleanupService,
    private readonly opsMetrics: OpsMetricsJob,
    private readonly calls: CallsService,
    private readonly clientReviews: ClientReviewsService,
    private readonly postVideos: PostVideosService,
    private readonly promotions: PromotionsService,
    private readonly stars: StarsService,
    private readonly taskReminders: TaskRemindersJob,
    private readonly taskArchivePurge: TaskArchivePurgeJob,
    private readonly casePayments: CasePaymentsService,
    private readonly partners: PartnersService,
    @Optional() private readonly demo: DemoService | undefined,
    private readonly caseDeadlineReminder: CaseDeadlineReminderJob,
    private readonly trust: AttorneyTrustService,
    private readonly fraud: ClientFraudService,
    @Optional() private readonly supportDesk?: SupportDeskService,
    @Optional() private readonly rewards?: RewardsService,
    // Owner 2026-10-05 (legal): `outreach.retention`.
    @Optional() private readonly outreachRetention?: OutreachRetentionService,
    @Optional() private readonly storageCleanup?: StorageCleanupService,
    @Optional() private readonly dataRetention?: DataRetentionService,
    @Optional() private readonly storageStats?: StorageStatsService,
    @Optional() private readonly opsGuard?: OpsGuardJob,
    @Optional() private readonly statusWatchdog?: StatusWatchdogJob,
    @Optional() private readonly legalReminders?: LegalRemindersJob,
    @Optional() private readonly usagePoll?: UsagePollJob,
    @Optional() private readonly opsState?: OpsStateService,
    @Optional() private readonly costAutoscale?: CostAutoscaleService,
    @Optional() private readonly treasury?: TreasuryService,
    @Optional() private readonly economy?: EconomyService,
    @Optional() private readonly countryPartners?: CountryPartnersService,
    @Optional() private readonly searchLog?: SearchLogService,
    @Optional() private readonly searchSynonyms?: SearchSynonymsService,
    @Optional() private readonly crashReports?: CrashReportsService,
    @Optional() private readonly consultationSweep?: ConsultationRemindersJob,
    @Optional() private readonly legalExports?: LegalExportBuilder,
    @Optional() private readonly legalRetention?: LegalRetentionService,
    @Optional() private readonly disappearing?: DisappearingSweepService,
    @Optional() private readonly chat?: ChatService,
    @Optional() private readonly legalQaSweep?: LegalQaSweepJob,
    // Owner 2026-10-22: `contacts.joined`.
    @Optional() private readonly contactsJoined?: ContactsJoinedJob,
    @Optional()
    private readonly contactsPepperBackfill?: ContactsPepperBackfillJob,
    @Optional() private readonly messagesReencrypt?: MessageReencryptJob,
    // BUG-1 (package N-12b): `chat.search-backfill`.
    @Optional() private readonly chatSearchBackfill?: ChatSearchBackfillJob,
    // Owner 2026-10-22: one queued job per account to anonymize.
    @Optional() private readonly accountDeletion?: AccountDeletionRunner,
    // Owner 2026-10-23: `admin.summaries`.
    @Optional() private readonly adminSummaries?: AdminSummariesJob,
    // Shard-ready step 7: `outbox.sweep`.
    @Optional() private readonly outbox?: CrossFamilyOutbox,
    // Owner 2026-10-24: `search.index`.
    @Optional() private readonly searchIndex?: SearchIndexJob,
    // Owner 2026-10-25: `experiments.metrics`.
    @Optional() private readonly experimentsNightly?: ExperimentsNightlyJob,
    // Day-one foundations: `ledger.reconcile`.
    @Optional() private readonly ledgerReconcile?: LedgerReconcileJob,
    // Privacy round 13: `privacy.retention`, `privacy.reconcile`,
    // `privacy.deletion-notices`.
    @Optional() private readonly privacyRetention?: PrivacyRetentionService,
    @Optional() private readonly privacyReconcile?: PrivacyReconcileJob,
    @Optional() private readonly deletionNotices?: DeletionNoticesService,
    // DB-ops hardening: `db.health`.
    @Optional() private readonly dbHealth?: DbHealthJob,
    // S10-13: one lock per job name for every schedule.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * S10-13: the single place that keeps a job from overlapping itself
   * (Kubernetes CronJob `concurrencyPolicy: Forbid`): a tick, a BullMQ
   * retry or `runNow` that finds the previous run of the SAME job still
   * going is skipped, never queued behind it. The TTL bounds a crashed
   * holder: a sub-hourly job is blocked for at most 3 minutes after a kill,
   * a heavy one for 60.
   */
  async process(name: string): Promise<unknown> {
    if (!this.redis) return this.dispatch(name);
    const pattern = CRON_SCHEDULES.find((s) => s.name === name)?.pattern ?? '';
    const ttlMs =
      cronLaneOf(name) === CRON_HEAVY_QUEUE
        ? 60 * 60_000
        : isSubHourly(pattern)
          ? 3 * 60_000
          : 30 * 60_000;
    const ran = await withJobLock(
      this.redis,
      `cron:${name}`,
      ttlMs,
      async () => ({
        value: await this.dispatch(name),
      }),
    );
    return ran ? ran.value : { skipped: 'previous run still active' };
  }

  private async dispatch(name: string): Promise<unknown> {
    // Owner 2026-10-05: «Пауза тяжёлых задач» (owner button or automatic
    // while the database is slow) — skip this tick, the next one runs.
    if (
      HEAVY_CRON_JOBS.includes(name) &&
      (await this.opsState?.isHeavyPaused())
    ) {
      return { skipped: 'heavy jobs paused' };
    }
    switch (name) {
      case CRON_JOBS.sessionsCleanup:
        return this.sessionsCleanup.run();
      case CRON_JOBS.otpCleanup:
        return this.otpCleanup.run();
      case CRON_JOBS.disposableDomainsRefresh:
        return this.disposableRefresh.run();
      case CRON_JOBS.reviewReminder:
        return this.reviewReminder.run();
      case CRON_JOBS.ratingReconcile:
        return this.ratingReconcile.run();
      case CRON_JOBS.licenseExpiry:
        return this.licenseExpiry.run();
      case CRON_JOBS.licenseRegistryRecheck:
        return this.licenseRegistryRecheck.run();
      case CRON_JOBS.bidSubscriptionLapse:
        return this.bidSubscriptionLapse.run();
      case CRON_JOBS.verificationLossBilling:
        return this.verificationLossBilling.run();
      case CRON_JOBS.caseStaleAsk:
        return this.caseStaleAsk.run();
      case CRON_JOBS.caseStalePause:
        return this.caseStalePause.run();
      case CRON_JOBS.caseAutoClose:
        return this.caseAutoClose.run();
      case CRON_JOBS.caseCompletionReminder:
        return this.caseCompletionReminder.run();
      case CRON_JOBS.countersReconcile:
        return this.countersReconcile.run();
      case CRON_JOBS.feedReco:
        return this.feedReco.run();
      case CRON_JOBS.trendingTags:
        return this.trendingTags.run();
      case CRON_JOBS.searchLearn:
        return this.searchLog?.learn();
      case CRON_JOBS.crashesPurge:
        return this.crashReports?.purge();
      case CRON_JOBS.searchTagTopics:
        return this.searchSynonyms?.tagRecent();
      case CRON_JOBS.notificationsRetention:
        return this.notificationsRetention.run();
      case CRON_JOBS.privacyAnonymize:
        return this.accountDeletion
          ? this.accountDeletion.scheduleDue()
          : this.anonymization.anonymizeDue();
      case CRON_JOBS.journalRetention:
        return this.journalRetention.run();
      case CRON_JOBS.journalChainVerify:
        return this.journalIntegrity.run();
      case CRON_JOBS.legalExports:
        return this.legalExports?.run() ?? null;
      case CRON_JOBS.legalRetention:
        return this.legalRetention?.run() ?? null;
      case CRON_JOBS.exportsCleanup:
        return this.exportsCleanup.run();
      case CRON_JOBS.opsQueueMetrics:
        return this.opsMetrics.queueDepths();
      case CRON_JOBS.searchIndex:
        return this.searchIndex?.run() ?? null;
      case CRON_JOBS.experimentsMetrics:
        return this.experimentsNightly?.run() ?? null;
      case CRON_JOBS.ledgerReconcile:
        return this.ledgerReconcile?.run() ?? null;
      case CRON_JOBS.privacyRetention:
        return this.privacyRetention?.run() ?? null;
      case CRON_JOBS.privacyReconcile:
        return this.privacyReconcile?.run() ?? null;
      case CRON_JOBS.privacyDeletionNotices:
        return this.deletionNotices?.sendDay13Due() ?? null;
      case CRON_JOBS.dbHealth:
        return this.dbHealth?.run() ?? null;
      case CRON_JOBS.adminSummaries:
        return this.adminSummaries?.run() ?? null;
      case CRON_JOBS.outboxSweep:
        return this.outbox?.sweep() ?? null;
      case CRON_JOBS.opsBusinessMetrics:
        return this.opsMetrics.businessCounters();
      case CRON_JOBS.disappearingSweep:
        return this.disappearing?.run() ?? null;
      case CRON_JOBS.chatRedeliver:
        return this.chat?.redeliverPending() ?? null;
      case CRON_JOBS.callsSweep:
        return this.calls.sweep();
      case CRON_JOBS.reviewAppealsSweep:
        return this.clientReviews.sweepAppeals();
      case CRON_JOBS.videosSweep:
        return this.postVideos.sweep();
      case CRON_JOBS.promotionsExpire:
        return this.promotions.expire();
      case CRON_JOBS.starsSweep:
        return this.stars.sweepPending();
      case CRON_JOBS.legalQaSweep:
        return this.legalQaSweep?.run() ?? null;
      case CRON_JOBS.contactsJoined:
        return this.contactsJoined?.run() ?? null;
      case CRON_JOBS.contactsPepperBackfill:
        return this.contactsPepperBackfill?.run() ?? null;
      case CRON_JOBS.messagesReencrypt:
        return this.messagesReencrypt?.run() ?? null;
      case CRON_JOBS.chatSearchBackfill:
        return this.chatSearchBackfill?.run() ?? null;
      case CRON_JOBS.consultationsSweep:
        return this.consultationSweep?.run() ?? null;
      case CRON_JOBS.taskReminders:
        return this.taskReminders.run();
      case CRON_JOBS.taskArchivePurge:
        return this.taskArchivePurge.run();
      case CRON_JOBS.casePaymentsExpire:
        return this.casePayments.expire();
      case CRON_JOBS.casePaymentsRemind:
        return this.casePayments.remind();
      case CRON_JOBS.partnersSweep:
        return this.partners.sweep();
      case CRON_JOBS.countryPartnersSweep:
        return this.countryPartners?.sweep();
      case CRON_JOBS.demoSweep:
        return this.demo?.sweep();
      case CRON_JOBS.caseDeadlineReminder:
        return this.caseDeadlineReminder.run();
      case CRON_JOBS.trustRecompute:
        return this.trust.recomputeAll();
      case CRON_JOBS.fraudSweep:
        return this.fraud.sweep();
      case CRON_JOBS.supportSweep:
        return this.supportDesk?.sweep();
      case CRON_JOBS.storageCleanup:
        return this.storageCleanup?.run() ?? null;
      case CRON_JOBS.storageRetention:
        return this.dataRetention?.run() ?? null;
      case CRON_JOBS.storageSnapshot:
        return this.storageStats?.snapshot() ?? null;
      case CRON_JOBS.rewardsAward:
        return this.rewards?.autoAward();
      case CRON_JOBS.outreachRetention:
        return this.outreachRetention?.run();
      case CRON_JOBS.opsGuard:
        return this.opsGuard?.guard();
      case CRON_JOBS.legalReminders:
        return this.legalReminders?.run() ?? null;
      case CRON_JOBS.statusWatchdog:
        return this.statusWatchdog?.run();
      case CRON_JOBS.usagePoll:
        return this.usagePoll?.run();
      case CRON_JOBS.opsCostCheck:
        return this.opsGuard?.costCheck();
      case CRON_JOBS.opsBackupCheck:
        return this.opsGuard?.backupCheck();
      case CRON_JOBS.costAutoscale:
        return this.costAutoscale?.run();
      case CRON_JOBS.economyGuard:
        return this.economy?.tick();
      case CRON_JOBS.treasuryDaily:
        return this.treasury?.daily() ?? null;
      default:
        // A job left over from an older/newer release: fail it visibly
        // rather than "succeed" doing nothing.
        throw new Error(`Unknown cron job: ${name}`);
    }
  }
}

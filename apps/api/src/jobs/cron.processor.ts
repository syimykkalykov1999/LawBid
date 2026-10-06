import { Injectable, Optional } from '@nestjs/common';
import { CRON_JOBS } from './jobs.constants';
import { CasePaymentsService } from '../modules/case-payments/case-payments.service';
import { PromotionsService } from '../modules/promotions/promotions.service';
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
import {
  CaseAutoArchiveJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStalePromptJob,
} from './handlers/case-lifecycle.jobs';
import { CaseDeadlineReminderJob } from './handlers/case-deadline-reminder.job';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';
import { TrendingTagsJob } from '../modules/search/trending-tags.job';
import { NotificationsRetentionJob } from './handlers/notifications-retention.job';
import { OpsMetricsJob } from './handlers/ops-metrics.job';
import { OpsGuardJob } from './handlers/ops-guard.job';
import { HEAVY_CRON_JOBS } from '../common/ops/ops.constants';
import { OpsStateService } from '../common/ops/ops-state.service';
import {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from './handlers/tasks-planner.jobs';
import { CallsService } from '../modules/calls/calls.service';
import { PostVideosService } from '../modules/posts/post-videos.service';
import { ClientReviewsService } from '../modules/client-reviews/client-reviews.service';
import { AccountAnonymizationService } from '../modules/privacy/account-anonymization.service';
import { ExportsCleanupService } from '../modules/privacy/exports-cleanup.service';
import { JournalIntegrityService } from '../modules/privacy/journal-integrity.service';
import { AttorneyTrustService } from '../modules/attorney-trust/attorney-trust.service';
import { ClientFraudService } from '../modules/client-fraud/client-fraud.service';
import { JournalRetentionService } from '../modules/privacy/journal-retention.service';
import { CostAutoscaleService } from '../common/cost-guard/cost-autoscale.service';
import { OutreachRetentionService } from '../modules/outreach/outreach-retention.service';
import { DemoService } from '../modules/demo/demo.service';
import { StorageCleanupService } from '../modules/storage/storage-cleanup.service';
import { DataRetentionService } from '../modules/storage/data-retention.service';
import { StorageStatsService } from '../modules/storage/storage-stats.service';
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
    private readonly caseStalePrompt: CaseStalePromptJob,
    private readonly caseAutoArchive: CaseAutoArchiveJob,
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
    @Optional() private readonly opsState?: OpsStateService,
    @Optional() private readonly costAutoscale?: CostAutoscaleService,
    @Optional() private readonly treasury?: TreasuryService,
    @Optional() private readonly countryPartners?: CountryPartnersService,
  ) {}

  async process(name: string): Promise<unknown> {
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
      case CRON_JOBS.caseStalePrompt:
        return this.caseStalePrompt.run();
      case CRON_JOBS.caseAutoArchive:
        return this.caseAutoArchive.run();
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
      case CRON_JOBS.notificationsRetention:
        return this.notificationsRetention.run();
      case CRON_JOBS.privacyAnonymize:
        return this.anonymization.anonymizeDue();
      case CRON_JOBS.journalRetention:
        return this.journalRetention.run();
      case CRON_JOBS.journalChainVerify:
        return this.journalIntegrity.run();
      case CRON_JOBS.exportsCleanup:
        return this.exportsCleanup.run();
      case CRON_JOBS.opsQueueMetrics:
        return this.opsMetrics.queueDepths();
      case CRON_JOBS.opsBusinessMetrics:
        return this.opsMetrics.businessCounters();
      case CRON_JOBS.callsSweep:
        return this.calls.sweep();
      case CRON_JOBS.reviewAppealsSweep:
        return this.clientReviews.sweepAppeals();
      case CRON_JOBS.videosSweep:
        return this.postVideos.sweep();
      case CRON_JOBS.promotionsExpire:
        return this.promotions.expire();
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
      case CRON_JOBS.opsCostCheck:
        return this.opsGuard?.costCheck();
      case CRON_JOBS.opsBackupCheck:
        return this.opsGuard?.backupCheck();
      case CRON_JOBS.costAutoscale:
        return this.costAutoscale?.run();
      case CRON_JOBS.treasuryDaily:
        return this.treasury?.daily() ?? null;
      default:
        // A job left over from an older/newer release: fail it visibly
        // rather than "succeed" doing nothing.
        throw new Error(`Unknown cron job: ${name}`);
    }
  }
}

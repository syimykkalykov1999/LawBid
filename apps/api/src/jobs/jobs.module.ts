import { PostsModule } from '../modules/posts/posts.module';
import { CasePaymentsCoreModule } from '../modules/case-payments/case-payments.module';
import { PromotionsCoreModule } from '../modules/promotions/promotions.module';
import { PartnersCoreModule } from '../modules/partners/partners.module';
import { OutreachRetentionModule } from '../modules/outreach/outreach.module';
import { CountryPartnersCoreModule } from '../modules/country-partners/country-partners.module';
import { RewardsModule } from '../modules/rewards/rewards.module';
import { SupportModule } from '../modules/support/support.module';
import { StorageCoreModule } from '../modules/storage/storage.module';
import { TreasuryCoreModule } from '../modules/treasury/treasury.module';
import { FileReleaseService } from '../modules/files/storage/file-release.service';
import { DynamicModule, Module } from '@nestjs/common';
import { DISPOSABLE_DOMAINS_FETCHER, JOBS_OPTIONS } from './jobs.constants';
import { JobsRunner, type JobsModuleOptions } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import { OtpCleanupJob } from './handlers/otp-cleanup.job';
import { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import { HttpDisposableDomainsFetcher } from './disposable-domains/disposable-domains.fetcher';
import { ReviewReminderJob } from './handlers/review-reminder.job';
import { RatingReconcileJob } from './handlers/rating-reconcile.job';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { LicenseExpiryJob } from './handlers/license-expiry.job';
import { LicenseRegistryRecheckJob } from './handlers/license-registry-recheck.job';
import { VerificationModule } from '../modules/verification/verification.module';
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
import {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from './handlers/tasks-planner.jobs';
import { S3StorageService } from '../modules/files/storage/s3-storage.service';
import { CallsModule } from '../modules/calls/calls.module';
import { ClientReviewsCoreModule } from '../modules/client-reviews/client-reviews.module';
import { CaseLifecycleModule } from '../modules/cases/lifecycle/case-lifecycle.module';
import { BidsModule } from '../modules/bids/bids.module';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';
import { DemoCoreModule } from '../modules/demo/demo.module';

/**
 * Periodic maintenance on BullMQ (docs/01 §5.2): session + OTP cleanup
 * (docs/02 §6.4), monthly disposable-domain refresh (docs/02 §3.3),
 * review reminder, nightly rating reconciliation (docs/03 §7.3, §7.5),
 * nightly license expiry (docs/03 §2.6) and the hourly bid-subscription-
 * lapse safety net (docs/04 §2, stage 4.4). Depends on the global
 * ConfigModule, PrismaModule, RedisModule, AppSettingsModule,
 * NotificationsModule and nestjs-pino LoggerModule. Imported by AppModule in 'api' mode and by
 * WorkerModule (src/worker.ts) in 'worker' mode.
 */
@Module({})
export class JobsModule {
  static register(options: JobsModuleOptions): DynamicModule {
    return {
      module: JobsModule,
      imports: [
        NotificationsModule,
        CallsModule,
        ClientReviewsCoreModule,
        SubscriptionsModule,
        BidsModule,
        CaseLifecycleModule,
        PostsModule,
        // Owner 2026-10-02: `promotions.expire`.
        PromotionsCoreModule,
        // Owner 2026-10-05: `case-payments.expire`.
        CasePaymentsCoreModule,
        // Owner 2026-10-05: `partners.sweep`.
        PartnersCoreModule,
        // Owner 2026-10-06: `country-partners.sweep`.
        CountryPartnersCoreModule,
        DemoCoreModule,
        // Owner 2026-10-05: `support.sweep`, `rewards.award`.
        SupportModule,
        RewardsModule,
        // Owner 2026-10-04: `licenses.registry-recheck`.
        VerificationModule,
        // Owner 2026-10-05 (legal): `outreach.retention`.
        OutreachRetentionModule,
        // Owner 2026-10-05: `storage.gc`, `storage.retention`,
        // `storage.snapshot`.
        StorageCoreModule,
        // Owner 2026-10-05: `treasury.daily` (profit and reserve).
        TreasuryCoreModule,
      ],
      providers: [
        { provide: JOBS_OPTIONS, useValue: options },
        {
          provide: DISPOSABLE_DOMAINS_FETCHER,
          useClass: HttpDisposableDomainsFetcher,
        },
        SessionsCleanupJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
        ReviewReminderJob,
        RatingReconcileJob,
        LicenseExpiryJob,
        LicenseRegistryRecheckJob,
        BidSubscriptionLapseJob,
        CaseStalePromptJob,
        CaseAutoArchiveJob,
        CaseAutoCloseJob,
        CaseCompletionReminderJob,
        CaseDeadlineReminderJob,
        CountersReconcileJob,
        FeedRecoJob,
        TrendingTagsJob,
        NotificationsRetentionJob,
        OpsMetricsJob,
        OpsGuardJob,
        // Owner 2026-10-05: the planner's reminders and archive cleanup.
        TaskRemindersJob,
        TaskArchivePurgeJob,
        S3StorageService,
        FileReleaseService,
        CronProcessor,
        JobsRunner,
      ],
      exports: [
        JobsRunner,
        SessionsCleanupJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
        ReviewReminderJob,
        RatingReconcileJob,
        LicenseExpiryJob,
        BidSubscriptionLapseJob,
        TaskRemindersJob,
        TaskArchivePurgeJob,
      ],
    };
  }
}

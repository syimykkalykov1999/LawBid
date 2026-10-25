import { PostsModule } from '../modules/posts/posts.module';
import { CasePaymentsCoreModule } from '../modules/case-payments/case-payments.module';
import { PromotionsCoreModule } from '../modules/promotions/promotions.module';
import { StarsCoreModule } from '../modules/stars/stars.module';
import { PartnersCoreModule } from '../modules/partners/partners.module';
import { OutreachRetentionModule } from '../modules/outreach/outreach.module';
import { CountryPartnersCoreModule } from '../modules/country-partners/country-partners.module';
import { RewardsModule } from '../modules/rewards/rewards.module';
import { SupportModule } from '../modules/support/support.module';
import { LegalExportsCoreModule } from '../modules/admin-data-requests/legal-exports-core.module';
import { StorageCoreModule } from '../modules/storage/storage.module';
import { LegalQaSweepJob } from '../modules/legal-qa/legal-qa-sweep.job';
import { ContactsJoinedJob } from './handlers/contacts-joined.job';
import { ContactsPepperBackfillJob } from './handlers/contacts-pepper-backfill.job';
import { MessageReencryptJob } from './handlers/message-reencrypt.job';
import { ContactsSyncModule } from '../modules/contacts-sync/contacts-sync.module';
import { ConsultationsCoreModule } from '../modules/consultations/consultations-core.module';
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
import { SearchIndexJob } from './handlers/search-index.job';
import { LedgerReconcileJob } from './handlers/ledger-reconcile.job';
import { LedgerModule } from '../modules/ledger/ledger.public';
import { OPENSEARCH_CLIENT_PROVIDER } from '../modules/search/engine/opensearch.client';
import { SearchDocsLoader } from '../modules/search/engine/search-docs.loader';
import { SearchIndexerService } from '../modules/search/search-indexer.service';
import { SearchReindexService } from '../modules/search/search-reindex.service';
import { DashboardService } from '../modules/admin/dashboard.service';
import { BillingOverviewService } from '../modules/admin-billing/billing-overview.service';
import { OpsGuardJob } from './handlers/ops-guard.job';
import { StatusWatchdogJob } from './handlers/status-watchdog.job';
import { UsagePollJob } from './handlers/usage-poll.job';
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
import { DisappearingSweepService } from '../modules/chat/disappearing-sweep.service';
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
        // Security research #5 (A7): ContactsPepper for the contacts jobs.
        ContactsSyncModule,
        CallsModule,
        ClientReviewsCoreModule,
        SubscriptionsModule,
        BidsModule,
        CaseLifecycleModule,
        PostsModule,
        // Owner 2026-10-02: `promotions.expire`.
        PromotionsCoreModule,
        // Owner 2026-10-20: `stars.sweep`.
        StarsCoreModule,
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
        LegalExportsCoreModule,
        // Owner 2026-10-05: `treasury.daily` (profit and reserve).
        TreasuryCoreModule,
        // Day-one foundations: `ledger.reconcile`.
        LedgerModule,
        // Owner 2026-10-20: `consultations.sweep`.
        ConsultationsCoreModule,
      ],
      providers: [
        { provide: JOBS_OPTIONS, useValue: options },
        {
          provide: DISPOSABLE_DOMAINS_FETCHER,
          useClass: HttpDisposableDomainsFetcher,
        },
        SessionsCleanupJob,
        // Owner 2026-10-21: `legal-qa.sweep`.
        LegalQaSweepJob,
        // Owner 2026-10-22: `contacts.joined`.
        ContactsJoinedJob,
        ContactsPepperBackfillJob,
        MessageReencryptJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
        ReviewReminderJob,
        RatingReconcileJob,
        LicenseExpiryJob,
        LicenseRegistryRecheckJob,
        BidSubscriptionLapseJob,
        VerificationLossBillingJob,
        CaseStaleAskJob,
        CaseStalePauseJob,
        CaseAutoCloseJob,
        CaseCompletionReminderJob,
        CaseDeadlineReminderJob,
        CountersReconcileJob,
        FeedRecoJob,
        TrendingTagsJob,
        SearchLogService,
        SearchSynonymsService,
        CrashReportsService,
        NotificationsRetentionJob,
        OpsMetricsJob,
        // Owner 2026-10-23: `admin.summaries` (admin economy pass).
        AdminSummariesJob,
        // Owner 2026-10-24: `search.index` (search-engine outbox).
        SearchIndexJob,
        LedgerReconcileJob,
        SearchIndexerService,
        SearchReindexService,
        SearchDocsLoader,
        OPENSEARCH_CLIENT_PROVIDER,
        DashboardService,
        BillingOverviewService,
        OpsGuardJob,
        StatusWatchdogJob,
        UsagePollJob,
        // Owner 2026-10-05: the planner's reminders and archive cleanup.
        TaskRemindersJob,
        TaskArchivePurgeJob,
        S3StorageService,
        FileReleaseService,
        // Owner 2026-10-21: `chat.disappearing`.
        DisappearingSweepService,
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

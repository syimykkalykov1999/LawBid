import { PostsModule } from '../modules/posts/posts.module';
import { ExperimentsCoreModule } from '../modules/experiments/experiments.module';
import { CasePaymentsCoreModule } from '../modules/case-payments/case-payments.module';
import { CaseToolsSweepModule } from '../modules/cases/tools/case-tools-sweep.module';
import { PromotionsCoreModule } from '../modules/promotions/promotions.module';
import { StarsCoreModule } from '../modules/stars/stars.module';
import { PartnersCoreModule } from '../modules/partners/partners.module';
import { OutreachRetentionModule } from '../modules/outreach/outreach.module';
import { CountryPartnersCoreModule } from '../modules/country-partners/country-partners.module';
import { RewardsModule } from '../modules/rewards/rewards.module';
import { SupportModule } from '../modules/support/support.module';
import { LegalExportsCoreModule } from '../modules/admin-data-requests/legal-exports-core.module';
import { StorageCoreModule } from '../modules/storage/storage.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { LegalQaSweepJob } from '../modules/legal-qa/legal-qa-sweep.job';
import { ContactsJoinedJob } from './handlers/contacts-joined.job';
import { ContactsPepperBackfillJob } from './handlers/contacts-pepper-backfill.job';
import { MessageReencryptJobModule } from './handlers/message-reencrypt.module';
import { ChatSearchBackfillJob } from './handlers/chat-search-backfill.job';
import { ContactsSyncModule } from '../modules/contacts-sync/contacts-sync.module';
import { ConsultationsCoreModule } from '../modules/consultations/consultations-core.module';
import { TreasuryCoreModule } from '../modules/treasury/treasury.module';
import { DynamicModule, Module } from '@nestjs/common';
import { SearchCoreModule } from '../modules/search/search.module';
import { AnalyticsCoreModule } from '../modules/analytics/analytics.module';
import { DISPOSABLE_DOMAINS_FETCHER, JOBS_OPTIONS } from './jobs.constants';
import { JobsRunner, type JobsModuleOptions } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import { PresenceSettleJob } from './handlers/presence-settle.job';
import { OtpCleanupJob } from './handlers/otp-cleanup.job';
import { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import { HttpDisposableDomainsFetcher } from './disposable-domains/disposable-domains.fetcher';
import { ReviewReminderJob } from './handlers/review-reminder.job';
import { RatingReconcileJob } from './handlers/rating-reconcile.job';
import { AttorneyReplyTimeJob } from './handlers/attorney-reply-time.job';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { LicenseExpiryJob } from './handlers/license-expiry.job';
import { LicenseRegistryRecheckJob } from './handlers/license-registry-recheck.job';
import { VerificationModule } from '../modules/verification/verification.module';
import { BidSubscriptionLapseJob } from './handlers/bid-subscription-lapse.job';
import { VerificationLossBillingJob } from './handlers/verification-loss-billing.job';
import {
  CaseStalePauseJob,
  CaseAutoCloseJob,
  BidConfirmReminderJob,
  CaseCompletionReminderJob,
  CaseStaleAskJob,
} from './handlers/case-lifecycle.jobs';
import { CaseDeadlineReminderJob } from './handlers/case-deadline-reminder.job';
import { CaseRebroadcastJob } from './handlers/case-rebroadcast.job';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';
import { CrashReportsCoreModule } from '../modules/crash-reports/crash-reports.module';
import { TrendingTagsJob } from '../modules/search/trending-tags.job';
import { TopicCoversJob } from '../modules/search/topic-covers.job';
import { NotificationsRetentionJob } from './handlers/notifications-retention.job';
import { OpsMetricsJob } from './handlers/ops-metrics.job';
import { AdminSummariesJob } from './handlers/admin-summaries.job';
import { PartitionCoreModule } from '../partitioning/partition.module';
import { SearchIndexJob } from './handlers/search-index.job';
import { DbBloatJob } from './handlers/db-bloat.job';
import { CdnInvalidateJob } from './handlers/cdn-invalidate.job';
import { PublicDirectoryCoreModule } from '../modules/public-directory/public-directory.module';
import { SeoGenerateJob } from './handlers/seo-generate.job';
import { PrivacyReconcileJob } from './handlers/privacy-reconcile.job';
import { LedgerReconcileJob } from './handlers/ledger-reconcile.job';
import { StripeOpsJob } from './handlers/stripe-ops.job';
import { StripeOpsCoreModule } from '../modules/stripe-ops/stripe-ops.module';
import { DbHealthJob } from './handlers/db-health.job';
import { LedgerModule } from '../modules/ledger/ledger.public';
import { FeatureFlagsModule } from '../modules/feature-flags/feature-flags.module';
import { DashboardCoreModule } from '../modules/admin/admin.module';
import { AdminOverviewCoreModule } from '../modules/admin-content/admin-content.module';
import { HotlineStatsCoreModule } from '../modules/hotline/hotline.module';
import { BillingOverviewCoreModule } from '../modules/admin-billing/admin-billing.module';
import { OpsGuardJob } from './handlers/ops-guard.job';
import { StatusWatchdogJob } from './handlers/status-watchdog.job';
import { SettingsRolloutWatchJob } from './handlers/settings-rollout-watch.job';
import { PnlCoreModule } from '../modules/admin-pnl/admin-pnl.module';
import { LegalRemindersJob } from './handlers/legal-reminders.job';
import { UsagePollJob } from './handlers/usage-poll.job';
import {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from './handlers/tasks-planner.jobs';
import { CallsModule } from '../modules/calls/calls.module';
import { ChatModule } from '../modules/chat/chat.module';
import { ClientReviewsCoreModule } from '../modules/client-reviews/client-reviews.module';
import { CaseLifecycleModule } from '../modules/cases/lifecycle/case-lifecycle.module';
import { BidsModule } from '../modules/bids/bids.module';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';
import { AdminAuditJobsModule } from '../modules/admin/admin-audit-jobs.module';
import { StaffCoreModule } from '../modules/staff-core/staff-core.module';
import { WorkLeaseCoreModule } from '../modules/work-lease/work-lease.module';
import { StaffRatingCoreModule } from '../modules/staff-rating/staff-rating.module';
import { StaffAppealsCoreModule } from '../modules/staff-appeals/staff-appeals.module';
import { StaffPieceworkCoreModule } from '../modules/staff-piecework/staff-piecework.module';
import { StaffHomeCoreModule } from '../modules/staff-home/staff-home.module';
import { StaffSecurityCoreModule } from '../modules/staff-security/staff-security.module';
import { StaffAiCoreModule } from '../modules/staff-ai/staff-ai.module';
import { AiWorkerCoreModule } from '../modules/ai-worker/ai-worker.module';
import { AiAttachmentsCoreModule } from '../modules/ai-attachments/ai-attachments.module';
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
        // Owner 2026-10-25: `experiments.metrics`.
        ExperimentsCoreModule,
        NotificationsModule,
        // AppEventsService (analytics snapshot) needs the flags.
        FeatureFlagsModule,
        // Pack C (round 2 #22): provided once by their owners, not copied
        // here (the API process built a second instance of each).
        AnalyticsCoreModule,
        SearchCoreModule,
        // Security research #5 (A7): ContactsPepper for the contacts jobs.
        ContactsSyncModule,
        CallsModule,
        // S1-3: `chat.redeliver`.
        ChatModule,
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
        // Owner 2026-10-25: `case-tools.sweep`.
        CaseToolsSweepModule,
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
        // R-401: `reco.qa-snapshot`.
        RecommendationsModule,
        LegalExportsCoreModule,
        // Owner 2026-10-05: `treasury.daily` (profit and reserve).
        TreasuryCoreModule,
        // Day-one foundations: `ledger.reconcile`.
        LedgerModule,
        // Stripe robustness: `stripe-ops.sweep`, `stripe-ops.dispute-reminders`.
        StripeOpsCoreModule,
        // Owner 2026-10-20: `consultations.sweep`.
        ConsultationsCoreModule,
        // Owner 2026-10-28: `admin.audit-export`, `admin.access-report`.
        AdminAuditJobsModule,
        // Staff package 2026-10-27: the `staff.*` jobs (each a no-op while
        // its switch is off) live in the modules that own them.
        StaffCoreModule,
        WorkLeaseCoreModule,
        StaffRatingCoreModule,
        StaffAppealsCoreModule,
        StaffPieceworkCoreModule,
        StaffHomeCoreModule,
        StaffSecurityCoreModule,
        StaffAiCoreModule,
        // Owner 2026-11-12 «ИИ-сотрудник»: `ai-worker.tick`.
        AiWorkerCoreModule,
        // Owner 2026-11-12 (row 49): `ai.retention`.
        AiAttachmentsCoreModule,
        // Holes re-check (25.11, item 17): these services are provided by
        // their owner modules only (one instance in the API process); the
        // core modules carry no controllers, so the worker stays HTTP-free.
        // jobs.module.spec.ts fails on any provider listed here AND elsewhere.
        CrashReportsCoreModule,
        PublicDirectoryCoreModule,
        PartitionCoreModule,
        MessageReencryptJobModule,
        DashboardCoreModule,
        AdminOverviewCoreModule,
        HotlineStatsCoreModule,
        BillingOverviewCoreModule,
        PnlCoreModule,
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
        ChatSearchBackfillJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
        ReviewReminderJob,
        RatingReconcileJob,
        AttorneyReplyTimeJob,
        LicenseExpiryJob,
        LicenseRegistryRecheckJob,
        BidSubscriptionLapseJob,
        VerificationLossBillingJob,
        CaseStaleAskJob,
        CaseStalePauseJob,
        CaseAutoCloseJob,
        BidConfirmReminderJob,
        CaseCompletionReminderJob,
        // Algo audit 2026-10-27 (CASES M-3): `cases.rebroadcast`.
        CaseRebroadcastJob,
        CaseDeadlineReminderJob,
        CountersReconcileJob,
        FeedRecoJob,
        TrendingTagsJob,
        TopicCoversJob,
        NotificationsRetentionJob,
        OpsMetricsJob,
        // Owner 2026-10-23: `admin.summaries` (admin economy pass).
        AdminSummariesJob,
        // Owner 2026-10-24: `search.index` (search-engine outbox).
        SearchIndexJob,
        // Owner 2026-10-25: `db.bloat-check`.
        DbBloatJob,
        // Owner 2026-10-25: `cdn.invalidate` (queued CloudFront paths).
        CdnInvalidateJob,
        // Programmatic SEO 2026-10-27: `seo.generate` (pages from the DB read path).
        SeoGenerateJob,
        LedgerReconcileJob,
        // Privacy round 13: `privacy.reconcile`.
        PrivacyReconcileJob,
        StripeOpsJob,
        // DB-ops hardening: `db.health` (daily).
        DbHealthJob,
        OpsGuardJob,
        StatusWatchdogJob,
        SettingsRolloutWatchJob,
        LegalRemindersJob,
        UsagePollJob,
        // Owner 2026-10-05: the planner's reminders and archive cleanup.
        TaskRemindersJob,
        TaskArchivePurgeJob,
        // Owner 2026-10-21: `chat.disappearing`.
        DisappearingSweepService,
        // Verify 5b (C4): `presence.settle`.
        PresenceSettleJob,
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

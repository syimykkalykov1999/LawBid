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
import { BidSubscriptionLapseJob } from './handlers/bid-subscription-lapse.job';
import {
  CaseAutoArchiveJob,
  CaseAutoCloseJob,
  CaseCompletionReminderJob,
  CaseStalePromptJob,
} from './handlers/case-lifecycle.jobs';
import { CountersReconcileJob } from './handlers/counters-reconcile.job';
import { FeedRecoJob } from '../modules/feed/feed-reco.job';
import { TrendingTagsJob } from '../modules/search/trending-tags.job';
import { CaseLifecycleModule } from '../modules/cases/lifecycle/case-lifecycle.module';
import { BidsModule } from '../modules/bids/bids.module';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';

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
        SubscriptionsModule,
        BidsModule,
        CaseLifecycleModule,
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
        BidSubscriptionLapseJob,
        CaseStalePromptJob,
        CaseAutoArchiveJob,
        CaseAutoCloseJob,
        CaseCompletionReminderJob,
        CountersReconcileJob,
        FeedRecoJob,
        TrendingTagsJob,
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
      ],
    };
  }
}

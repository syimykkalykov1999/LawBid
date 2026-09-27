import { DynamicModule, Module } from '@nestjs/common';
import { DISPOSABLE_DOMAINS_FETCHER, JOBS_OPTIONS } from './jobs.constants';
import { JobsRunner, type JobsModuleOptions } from './jobs.runner';
import { CronProcessor } from './cron.processor';
import { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import { OtpCleanupJob } from './handlers/otp-cleanup.job';
import { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import { HttpDisposableDomainsFetcher } from './disposable-domains/disposable-domains.fetcher';

/**
 * Periodic maintenance on BullMQ (docs/01 §5.2): session + OTP cleanup
 * (docs/02 §6.4), monthly disposable-domain refresh (docs/02 §3.3).
 * Depends on the global ConfigModule, PrismaModule, RedisModule and
 * nestjs-pino LoggerModule. Imported by AppModule in 'api' mode and by
 * WorkerModule (src/worker.ts) in 'worker' mode.
 */
@Module({})
export class JobsModule {
  static register(options: JobsModuleOptions): DynamicModule {
    return {
      module: JobsModule,
      providers: [
        { provide: JOBS_OPTIONS, useValue: options },
        {
          provide: DISPOSABLE_DOMAINS_FETCHER,
          useClass: HttpDisposableDomainsFetcher,
        },
        SessionsCleanupJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
        CronProcessor,
        JobsRunner,
      ],
      exports: [
        JobsRunner,
        SessionsCleanupJob,
        OtpCleanupJob,
        DisposableDomainsRefreshJob,
      ],
    };
  }
}

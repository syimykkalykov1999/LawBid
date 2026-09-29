import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AuthModule } from '../auth/auth.module';
import { createEmailProvider } from '../auth/providers/email/email-provider.factory';
import { CaseLifecycleModule } from '../cases/lifecycle/case-lifecycle.module';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NOTIFICATION_EMAIL } from '../notifications/push/push.constants';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AccountAnonymizationService } from './account-anonymization.service';
import { DataExportController } from './data-export.controller';
import { DataExportRunner } from './data-export.runner';
import { DataExportService } from './data-export.service';
import { ExportsCleanupService } from './exports-cleanup.service';
import { JournalIntegrityService } from './journal-integrity.service';
import { JournalRetentionService } from './journal-retention.service';
import {
  PRIVACY_OPTIONS,
  type PrivacyModuleOptions,
} from './privacy.constants';

/**
 * docs/06 §5 (stage 6.9): account anonymization after the grace period,
 * the user data export, journal retention + integrity, export cleanup.
 * `mode: 'api'` adds the controller (and AuthModule for the reauth
 * check); the worker stays bootable without AppModule's global modules.
 */
@Module({})
export class PrivacyModule {
  static register(options: PrivacyModuleOptions): DynamicModule {
    return {
      module: PrivacyModule,
      // Global for the same reason as BillingModule: CronProcessor (JobsModule)
      // injects the privacy services without a second instance.
      global: true,
      imports: [
        NotificationsModule,
        CaseLifecycleModule,
        SubscriptionsModule,
        JournalModule,
        ...(options.mode === 'api' ? [AuthModule] : []),
      ],
      controllers: options.mode === 'api' ? [DataExportController] : [],
      providers: [
        { provide: PRIVACY_OPTIONS, useValue: options },
        S3StorageService,
        {
          provide: NOTIFICATION_EMAIL,
          inject: [ConfigService, PinoLogger],
          useFactory: createEmailProvider,
        },
        AccountAnonymizationService,
        DataExportService,
        DataExportRunner,
        JournalRetentionService,
        JournalIntegrityService,
        ExportsCleanupService,
      ],
      exports: [
        AccountAnonymizationService,
        DataExportService,
        DataExportRunner,
        JournalRetentionService,
        JournalIntegrityService,
        ExportsCleanupService,
      ],
    };
  }
}

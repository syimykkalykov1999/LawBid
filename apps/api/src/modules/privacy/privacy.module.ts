import { type DynamicModule, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AuthModule } from '../auth/auth.module';
import { BidsModule } from '../bids/bids.module';
import { SecretsService } from '../../common/secrets/secrets.service';
import { createEmailProvider } from '../auth/providers/email/email-provider.factory';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseLifecycleModule } from '../cases/lifecycle/case-lifecycle.module';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { FileReleaseService } from '../files/storage/file-release.service';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NOTIFICATION_EMAIL } from '../notifications/push/push.constants';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { VideosModule } from '../videos/videos.module';
import { AccountAnonymizationService } from './account-anonymization.service';
import { PersonalDataErasureService } from './personal-data-erasure.service';
import { AccountDeletionRunner } from './account-deletion.runner';
import {
  ACCOUNT_ERASER,
  DELETION_NOTICES,
} from '../../common/privacy/privacy.ports';
import { DataExportController } from './data-export.controller';
import { DeletionCancelController } from './deletion-cancel.controller';
import { DeletionNoticesService } from './deletion-notices.service';
import { DeletionStepsService } from './deletion-steps.service';
import { ErasureLedgerService } from './erasure-ledger.service';
import { PrivacyRetentionService } from './privacy-retention.service';
import { VendorDeletionService } from './vendor-deletion.service';
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
        BidsModule,
        JournalModule,
        // «Вход и письма по почте» gates the data-export e-mail.
        FeatureFlagsModule,
        // Owner 2026-10-22: reels / story videos go at Bunny on deletion.
        VideosModule,
        ...(options.mode === 'api' ? [AuthModule] : []),
      ],
      controllers:
        options.mode === 'api'
          ? [DataExportController, DeletionCancelController]
          : [],
      providers: [
        { provide: PRIVACY_OPTIONS, useValue: options },
        S3StorageService,
        FileReleaseService,
        {
          provide: NOTIFICATION_EMAIL,
          inject: [ConfigService, PinoLogger, SecretsService, PrismaService],
          useFactory: createEmailProvider,
        },
        PersonalDataErasureService,
        AccountAnonymizationService,
        AccountDeletionRunner,
        DataExportService,
        DataExportRunner,
        JournalRetentionService,
        JournalIntegrityService,
        ExportsCleanupService,
        // Privacy round 13.
        ErasureLedgerService,
        DeletionStepsService,
        VendorDeletionService,
        DeletionNoticesService,
        PrivacyRetentionService,
        { provide: ACCOUNT_ERASER, useExisting: AccountAnonymizationService },
        { provide: DELETION_NOTICES, useExisting: DeletionNoticesService },
      ],
      exports: [
        ACCOUNT_ERASER,
        DELETION_NOTICES,
        ErasureLedgerService,
        DeletionStepsService,
        DeletionNoticesService,
        PrivacyRetentionService,
        PersonalDataErasureService,
        AccountAnonymizationService,
        AccountDeletionRunner,
        DataExportService,
        DataExportRunner,
        JournalRetentionService,
        JournalIntegrityService,
        ExportsCleanupService,
      ],
    };
  }
}

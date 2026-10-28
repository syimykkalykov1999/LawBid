import { Module, type DynamicModule } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BidsModule } from '../bids/bids.module';
import { FilesModule } from '../files/files.module';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  DEAL_RECORD_OPTIONS,
  DealRecordRunner,
  type DealRecordRunnerOptions,
} from './deal-record.runner';
import { DealRecordPreview } from './deal-record.preview';
import { DealRecordTexts } from './deal-record-texts';
import {
  AdminDealRecordController,
  DealRecordsController,
} from './deal-records.controller';
import { DealRecordsService } from './deal-records.service';

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md).
 * `api` mode serves HTTP (and renders while JOBS_ENABLED); `worker` mode
 * only consumes the `deal-record` queue (src/worker.ts). Off by default:
 * `deal_record.enabled` (admin «Запись о сделке»).
 */
@Module({})
export class DealsModule {
  static register(options: DealRecordRunnerOptions): DynamicModule {
    return {
      module: DealsModule,
      imports:
        options.mode === 'api'
          ? [
              BidsModule,
              FilesModule,
              JournalModule,
              NotificationsModule,
              AdminAccessModule,
            ]
          : [FilesModule, JournalModule, NotificationsModule],
      controllers:
        options.mode === 'api'
          ? [DealRecordsController, AdminDealRecordController]
          : [],
      providers: [
        { provide: DEAL_RECORD_OPTIONS, useValue: options },
        DealRecordTexts,
        DealRecordRunner,
        ...(options.mode === 'api'
          ? [DealRecordsService, DealRecordPreview]
          : []),
      ],
    };
  }
}

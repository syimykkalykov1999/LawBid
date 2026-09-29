import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthEventService } from '../auth/services/auth-event.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import {
  CaseHistoryExportRunner,
  HISTORY_EXPORT_OPTIONS,
  type HistoryExportOptions,
} from './case-history-export.runner';
import { CaseHistoryController } from './case-history.controller';
import { CaseHistoryService } from './case-history.service';

/** docs/04_CASES_BIDS.md §12 (stage 4.7): "История кейсов" + PDF export.
 * `api` mode serves HTTP (and processes exports while JOBS_ENABLED);
 * `worker` mode only processes the export queue (src/worker.ts). */
@Module({})
export class CaseHistoryModule {
  static register(options: HistoryExportOptions): DynamicModule {
    return {
      module: CaseHistoryModule,
      // api: reauth (ReauthVerifier/Guard) + AuthEventService from AuthModule;
      // worker: only the plain AuthEventService the service injects.
      imports: options.mode === 'api' ? [AuthModule] : [],
      controllers: options.mode === 'api' ? [CaseHistoryController] : [],
      providers: [
        { provide: HISTORY_EXPORT_OPTIONS, useValue: options },
        CaseHistoryService,
        CaseHistoryExportRunner,
        S3StorageService,
        ...(options.mode === 'worker' ? [AuthEventService] : []),
      ],
    };
  }
}

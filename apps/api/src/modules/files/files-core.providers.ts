import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3StorageService } from './storage/s3-storage.service';
import { ImageProcessor } from './processing/image-processor';
import { FileScanProcessor } from './jobs/file-scan.processor';
import {
  FILES_JOBS_OPTIONS,
  FileScanRunner,
  type FilesJobsOptions,
} from './jobs/file-scan.runner';
import { VIRUS_SCANNER, selectVirusScanner } from './scanning/virus-scanner';

/** Storage + scan pipeline shared by the API (FilesModule) and the
 * dedicated worker process (FilesWorkerModule). */
export function filesCoreProviders(options: FilesJobsOptions): Provider[] {
  return [
    { provide: FILES_JOBS_OPTIONS, useValue: options },
    {
      provide: VIRUS_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        selectVirusScanner({
          nodeEnv: config.get<string>('NODE_ENV'),
          clamavHost: config.get<string>('CLAMAV_HOST'),
          clamavPort: config.get<number>('CLAMAV_PORT'),
        }),
    },
    S3StorageService,
    ImageProcessor,
    FileScanProcessor,
    FileScanRunner,
  ];
}

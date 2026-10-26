import { Module } from '@nestjs/common';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { LegalExportBuilder } from './legal-export.builder';
import { LegalRetentionService } from './legal-retention.service';

/** Worker-side half of the government-request export: the archive builder
 * and the 90-day scrub. Needs the global Config / Prisma / AppSettings /
 * Logger; shared by the API module and JobsModule. */
@Module({
  providers: [S3StorageService, LegalExportBuilder, LegalRetentionService],
  exports: [S3StorageService, LegalExportBuilder, LegalRetentionService],
})
export class LegalExportsCoreModule {}

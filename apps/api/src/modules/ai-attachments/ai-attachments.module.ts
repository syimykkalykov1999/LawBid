import { Module } from '@nestjs/common';
import { AiRetentionJob } from '../../jobs/handlers/ai-retention.job';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminConfigModule } from '../admin-config/admin-config.module';
import { FilesModule } from '../files/files.module';
import { FileReleaseService, S3StorageService } from '../files/files.public';
import { AiAttachmentsController } from './ai-attachments.controller';
import { AiAttachmentsService } from './ai-attachments.service';
import { AiRetentionService } from './ai-retention.service';

/**
 * Owner 2026-11-12 (rows 48, 49): the owner's images for the two AIs and the
 * cleanup of everything the AI makes. Core part for the API and the worker
 * (the `ai.retention` cron and the AI employee's batches read the images);
 * it uses the files storage like StorageCoreModule does.
 */
@Module({
  providers: [
    S3StorageService,
    FileReleaseService,
    AiAttachmentsService,
    AiRetentionService,
    AiRetentionJob,
  ],
  exports: [AiAttachmentsService, AiRetentionService, AiRetentionJob],
})
export class AiAttachmentsCoreModule {}

/** The owner-only admin routes (API only). */
@Module({
  imports: [
    AiAttachmentsCoreModule,
    FilesModule,
    AdminAccessModule,
    AdminConfigModule,
  ],
  controllers: [AiAttachmentsController],
})
export class AiAttachmentsModule {}

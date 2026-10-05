import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FilesModule } from '../files/files.module';
import { FileReleaseService } from '../files/storage/file-release.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { AdminStorageController } from './admin-storage.controller';
import { DataRetentionService } from './data-retention.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageStatsService } from './storage-stats.service';

/** Owner 2026-10-05 (storage like Telegram): the cleanup of unused files,
 * log retention and storage statistics — run by the cron jobs
 * (`storage.gc`, `storage.retention`, `storage.snapshot`). Needs the
 * global Config / Prisma / Redis / AppSettings / Logger. */
@Module({
  providers: [
    S3StorageService,
    FileReleaseService,
    StorageCleanupService,
    DataRetentionService,
    StorageStatsService,
  ],
  exports: [
    FileReleaseService,
    StorageCleanupService,
    DataRetentionService,
    StorageStatsService,
  ],
})
export class StorageCoreModule {}

/** Система → «Хранилище» in the admin. */
@Module({
  imports: [StorageCoreModule, FilesModule, AdminAccessModule],
  controllers: [AdminStorageController],
})
export class StorageModule {}

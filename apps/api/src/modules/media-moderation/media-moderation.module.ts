import { type DynamicModule, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FileReleaseService } from '../files/storage/file-release.service';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { VideosModule } from '../videos/videos.module';
import { AdminMediaModerationController } from './admin-media-moderation.controller';
import {
  CSAM_HASH_MATCHER,
  CSAM_REPORTER,
  NcmecReporterStub,
  PhotoDnaMatcher,
} from './csam.adapters';
import {
  IMAGE_MODERATION_PROVIDER,
  RekognitionModerationProvider,
} from './image-moderation.provider';
import {
  MEDIA_MODERATION_OPTIONS,
  type MediaModerationModuleOptions,
} from './media-moderation.constants';
import { MediaModerationQueue } from './media-moderation.queue';
import { MediaModerationRunner } from './media-moderation.runner';
import { MediaModerationService } from './media-moderation.service';

/**
 * Owner 2026-10-22 (audit #4 §5): image / reel-thumbnail moderation.
 * Global so the upload pipeline (FileScanRunner), VideosService and
 * FilesService reach the queue and the "blocked" check without importing
 * this module (no cycle: they inject it @Optional()). `mode: 'api'` adds
 * the admin controller.
 */
@Module({})
export class MediaModerationModule {
  static register(options: MediaModerationModuleOptions): DynamicModule {
    return {
      module: MediaModerationModule,
      global: true,
      imports: [
        VideosModule,
        ...(options.mode === 'api' ? [AdminAccessModule] : []),
      ],
      controllers:
        options.mode === 'api' ? [AdminMediaModerationController] : [],
      providers: [
        { provide: MEDIA_MODERATION_OPTIONS, useValue: options },
        S3StorageService,
        FileReleaseService,
        {
          provide: IMAGE_MODERATION_PROVIDER,
          useClass: RekognitionModerationProvider,
        },
        { provide: CSAM_HASH_MATCHER, useClass: PhotoDnaMatcher },
        { provide: CSAM_REPORTER, useClass: NcmecReporterStub },
        MediaModerationQueue,
        MediaModerationService,
        MediaModerationRunner,
      ],
      exports: [MediaModerationQueue, MediaModerationService],
    };
  }
}

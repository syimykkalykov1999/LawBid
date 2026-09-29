import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { filesCoreProviders } from './files-core.providers';
import { FilesBootstrapService } from './storage/files-bootstrap.service';

/**
 * docs/03_VERIFICATION_PROFILES.md stage 3.2: pre-signed S3 uploads,
 * magic-bytes/size/SHA-256 checks, antivirus scan (BullMQ `files` queue,
 * processed here while JOBS_ENABLED and always in src/worker.ts), HEIC →
 * JPEG, avatar processing, signed links. AuthModule supplies
 * RateLimitService. Other modules attach files only through
 * FilesService.assertAttachable().
 */
@Module({
  // FeatureFlagsModule: `video_posts` gate on post_video uploads (docs/05 §3.6).
  imports: [AuthModule, FeatureFlagsModule],
  controllers: [FilesController],
  providers: [
    ...filesCoreProviders({ mode: 'api' }),
    FilesService,
    FilesBootstrapService,
  ],
  exports: [FilesService],
})
export class FilesModule {}

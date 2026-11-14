import { Module } from '@nestjs/common';
import { RateLimitService } from '../auth/auth.public';
import { FilesModule } from '../files/files.module';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewImageService } from './link-preview-image.service';
import { LinkPreviewService } from './link-preview.service';

/** Owner 2026-10-22: isolated chat link previews (own limits and cache). */
@Module({
  // Media batch A (R7): pictures are stored as our own public media.
  imports: [FilesModule],
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService, LinkPreviewImageService, RateLimitService],
})
export class LinkPreviewModule {}

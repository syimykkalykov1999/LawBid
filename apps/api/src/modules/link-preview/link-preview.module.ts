import { Module } from '@nestjs/common';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewService } from './link-preview.service';

/** Owner 2026-10-22: isolated chat link previews (own limits and cache). */
@Module({
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService, RateLimitService],
})
export class LinkPreviewModule {}

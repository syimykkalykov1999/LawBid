import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { BlocksModule } from '../blocks/blocks.module';
import { UserBriefModule } from '../user-brief/user-brief.module';
import { VideosModule } from '../videos/videos.module';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

/** Owner 2026-10-20 — stories (24 h). */
@Module({
  imports: [
    FilesModule,
    VideosModule,
    UsageLimitsModule,
    FeatureFlagsModule,
    UserBriefModule,
    BlocksModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}

import { UsernamesModule } from '../usernames/usernames.module';
import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlocksModule } from '../blocks/blocks.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { UserBriefModule } from '../user-brief/user-brief.module';
import { VideosModule } from '../videos/videos.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ChannelFanoutModule } from './channel-fanout.module';

/** Owner 2026-10-20 — Telegram-style channels. */
@Module({
  imports: [
    FilesModule,
    VideosModule,
    UsageLimitsModule,
    FeatureFlagsModule,
    NotificationsModule,
    UserBriefModule,
    BlocksModule,
    UsernamesModule,
    RecommendationsModule,
    // Owner 2026-10-22: queues a post's notifications (and runs them
    // while JOBS_ENABLED; the worker process always does).
    ChannelFanoutModule.register({ mode: 'api' }),
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}

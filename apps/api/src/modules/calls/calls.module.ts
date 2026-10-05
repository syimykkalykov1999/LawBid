import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';

/** OQ-041: in-app audio calls; owner 2026-10-05: video calls. */
@Module({
  imports: [
    UsageLimitsModule,
    BlocksModule,
    ChatModule,
    // Owner 2026-10-05: the `video_calls` flag.
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}

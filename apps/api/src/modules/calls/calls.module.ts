import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';
import { CallsController } from './calls.controller';
import { LiveKitWebhookController } from './livekit-webhook.controller';
import { CallsService } from './calls.service';
import { SfuBrokerService } from './sfu-broker.service';

/** OQ-041: in-app audio calls; owner 2026-10-05: video calls. */
@Module({
  imports: [
    UsageLimitsModule,
    BlocksModule,
    ChatModule,
    // Owner 2026-10-05: the `video_calls` flag.
    FeatureFlagsModule,
    FilesModule,
    GroupsModule,
    NotificationsModule,
    SubscriptionsModule,
    PrivacySettingsModule,
  ],
  // CallHistoryController first: `calls/history` must not match `calls/:id`.
  controllers: [
    CallHistoryController,
    CallsController,
    LiveKitWebhookController,
  ],
  providers: [CallsService, CallHistoryService, SfuBrokerService],
  exports: [CallsService],
})
export class CallsModule {}

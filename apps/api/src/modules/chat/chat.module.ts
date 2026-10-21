import { StickersModule } from '../stickers/stickers.module';
import { StarsCoreModule } from '../stars/stars.module';
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { PresenceModule } from '../presence/presence.module';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostsModule } from '../posts/posts.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ChatController } from './chat.controller';
import { ChatActionsController } from './chat-actions.controller';
import { ChatActionsService } from './chat-actions.service';
import { ChatService } from './chat.service';
import { ChatTranslationService } from './chat-translation.service';
import { TranslationCoreModule } from '../translation/translation.module';

/** docs/05 §8 chats REST (stage 5.7); realtime in RealtimeModule. */
@Module({
  imports: [
    UsageLimitsModule,
    BlocksModule,
    FilesModule,
    SubscriptionsModule,
    NotificationsModule,
    PresenceModule,
    PrivacySettingsModule,
    StickersModule,
    StarsCoreModule,
    FeatureFlagsModule,
    TranslationCoreModule,
    // Owner 2026-10-21: a post shared into a chat (Instagram).
    PostsModule,
  ],
  controllers: [ChatController, ChatActionsController],
  providers: [ChatService, ChatTranslationService, ChatActionsService],
  exports: [ChatService],
})
export class ChatModule {}

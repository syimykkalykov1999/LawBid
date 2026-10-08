import { PromotionsCoreModule } from '../promotions/promotions.module';
import { StickersModule } from '../stickers/stickers.module';
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { PresenceModule } from '../presence/presence.module';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatTranslationService } from './chat-translation.service';
import { TranslationCoreModule } from '../translation/translation.module';

/** docs/05 §8 chats REST (stage 5.7); realtime in RealtimeModule. */
@Module({
  imports: [
    // Owner 2026-10-07: real actions count for boosts paid per action.
    PromotionsCoreModule,
    UsageLimitsModule,
    BlocksModule,
    FilesModule,
    SubscriptionsModule,
    NotificationsModule,
    PresenceModule,
    StickersModule,
    FeatureFlagsModule,
    TranslationCoreModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatTranslationService],
  exports: [ChatService],
})
export class ChatModule {}

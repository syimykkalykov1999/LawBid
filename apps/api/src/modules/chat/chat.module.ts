import { StickersModule } from '../stickers/stickers.module';
import { Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** docs/05 §8 chats REST (stage 5.7); realtime in RealtimeModule. */
@Module({
  imports: [
    UsageLimitsModule,
    BlocksModule,
    FilesModule,
    SubscriptionsModule,
    NotificationsModule,
    PresenceModule,
    StickersModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}

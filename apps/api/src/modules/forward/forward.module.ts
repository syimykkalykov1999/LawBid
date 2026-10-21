import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ChatModule } from '../chat/chat.module';
import { GroupsModule } from '../groups/groups.module';
import { ForwardController } from './forward.controller';
import { ForwardService } from './forward.service';

/** Owner 2026-10-21 (Telegram «Переслать»): one forward into many chats. */
@Module({
  imports: [ChatModule, GroupsModule, ChannelsModule],
  controllers: [ForwardController],
  providers: [ForwardService],
})
export class ForwardModule {}

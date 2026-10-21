import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { ChatSavedController } from './chat-saved.controller';
import { ChatSavedService } from './chat-saved.service';

/** Owner 2026-10-20: «Сохранённое» for chat messages. */
@Module({
  imports: [ChatModule],
  controllers: [ChatSavedController],
  providers: [ChatSavedService],
})
export class ChatSavedModule {}

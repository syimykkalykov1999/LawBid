import { Module } from '@nestjs/common';
import { ChatSystemMessages } from './chat-system.service';

/** Lean module for the file-04 services (no chat REST dependencies). */
@Module({
  providers: [ChatSystemMessages],
  exports: [ChatSystemMessages],
})
export class ChatSystemModule {}

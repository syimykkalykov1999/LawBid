import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatSystemMessages } from './chat-system.service';

/** Lean module for the file-04 services (no chat REST dependencies). */
@Module({
  imports: [NotificationsModule],
  providers: [ChatSystemMessages],
  exports: [ChatSystemMessages],
})
export class ChatSystemModule {}

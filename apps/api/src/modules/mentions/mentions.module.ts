import { Global, Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MentionsService } from './mentions.service';

/** OQ-042: @username mentions (posts, comments). */
@Global()
@Module({
  imports: [BlocksModule, NotificationsModule],
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}

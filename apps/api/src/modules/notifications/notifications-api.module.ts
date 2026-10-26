import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { FilesModule } from '../files/files.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsApiController } from './notifications-api.controller';
import { NotificationsApiService } from './notifications-api.service';
import { NotificationsModule } from './notifications.module';
import { PushActionsController } from './push-actions.controller';
import { PushActionsService } from './push-actions.service';
import { PushTokensService } from './push/push-tokens.service';
import { VoipTokensService } from './push/voip-tokens.service';

/** docs/05 §15 notifications REST (API process only). */
@Module({
  // Owner 2026-10-26: chat + groups for the notification buttons
  // («Ответить» / «Прочитано», PushActionsController).
  imports: [NotificationsModule, FilesModule, ChatModule, GroupsModule],
  controllers: [NotificationsApiController, PushActionsController],
  providers: [
    NotificationsApiService,
    PushTokensService,
    VoipTokensService,
    PushActionsService,
  ],
})
export class NotificationsApiModule {}

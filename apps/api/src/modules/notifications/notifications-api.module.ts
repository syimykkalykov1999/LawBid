import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { NotificationsApiController } from './notifications-api.controller';
import { NotificationsApiService } from './notifications-api.service';
import { NotificationsModule } from './notifications.module';
import { PushTokensService } from './push/push-tokens.service';

/** docs/05 §15 notifications REST (API process only). */
@Module({
  imports: [NotificationsModule, FilesModule],
  controllers: [NotificationsApiController],
  providers: [NotificationsApiService, PushTokensService],
})
export class NotificationsApiModule {}

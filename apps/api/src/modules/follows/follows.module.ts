import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

/** docs/05 §6 follows (stage 5.5). */
@Module({
  imports: [UsageLimitsModule, NotificationsModule, FilesModule],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}

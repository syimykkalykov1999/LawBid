import { UsernamesModule } from '../usernames/usernames.module';
import { GroupAddPolicy } from './group-add-policy';
import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { GroupPollsService } from './group-polls.service';
import { GroupPresenter } from './group-presenter.service';
import { GroupSharedController } from './group-shared.controller';
import { GroupSharedService } from './group-shared.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupFanoutQueue } from './group-fanout.queue';

/** Owner 2026-10-20: group chats and polls; realtime in RealtimeModule. */
@Module({
  imports: [
    AdminAccessModule,
    BlocksModule,
    FilesModule,
    NotificationsModule,
    PrivacySettingsModule,
    UsernamesModule,
    RecommendationsModule,
  ],
  controllers: [GroupsController, GroupSharedController, AdminGroupsController],
  providers: [
    GroupAddPolicy,
    GroupsService,
    GroupPollsService,
    GroupPresenter,
    GroupSharedService,
    AdminGroupsService,
    // Owner 2026-10-22: the ordered fan-out queue (producer side).
    GroupFanoutQueue,
  ],
  exports: [GroupsService],
})
export class GroupsModule {}

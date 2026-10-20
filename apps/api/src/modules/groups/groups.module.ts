import { GroupAddPolicy } from './group-add-policy';
import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { GroupPollsService } from './group-polls.service';
import { GroupPresenter } from './group-presenter.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/** Owner 2026-10-20: group chats and polls; realtime in RealtimeModule. */
@Module({
  imports: [AdminAccessModule, BlocksModule, FilesModule, NotificationsModule],
  controllers: [GroupsController, AdminGroupsController],
  providers: [
    GroupAddPolicy,
    GroupsService,
    GroupPollsService,
    GroupPresenter,
    AdminGroupsService,
  ],
  exports: [GroupsService],
})
export class GroupsModule {}

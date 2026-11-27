import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { UsernamesModule } from '../usernames/usernames.module';
import { GroupAddPolicy } from './group-add-policy';
import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { GROUP_FILE_SCAN_LISTENER } from '../files/files.public';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PrivacySettingsModule } from '../privacy-settings/privacy-settings.module';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { GroupPollsService } from './group-polls.service';
import { GroupReactionsService } from './group-reactions.service';
import { GroupReceiptsService } from './group-receipts.service';
import { StarsCoreModule } from '../stars/stars.module';
import { GroupPresenter } from './group-presenter.service';
import { GroupSharedController } from './group-shared.controller';
import { GroupSharedService } from './group-shared.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupFanoutQueue } from './group-fanout.queue';
import { GroupE2eeController } from './e2ee/group-e2ee.controller';
import { GroupE2eeService } from './e2ee/group-e2ee.service';
import { GroupMlsGate } from './e2ee/group-mls-gate';

/** Owner 2026-10-20: group chats and polls; realtime in RealtimeModule. */
@Module({
  imports: [
    // Owner 2026-10-22: `rate_limit.group_create_per_day`.
    UsageLimitsModule,
    AdminAccessModule,
    BlocksModule,
    // Owner 2026-11-16 (row 183): the admin switch «Группы».
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    PrivacySettingsModule,
    UsernamesModule,
    RecommendationsModule,
    // Groups WhatsApp parity: premium reactions cost stars, as in 1:1 chats.
    StarsCoreModule,
  ],
  controllers: [
    GroupsController,
    GroupSharedController,
    AdminGroupsController,
    // Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md).
    GroupE2eeController,
  ],
  providers: [
    GroupAddPolicy,
    GroupsService,
    GroupPollsService,
    GroupReactionsService,
    GroupReceiptsService,
    GroupPresenter,
    GroupSharedService,
    AdminGroupsService,
    // Owner 2026-10-22: the ordered fan-out queue (producer side).
    GroupFanoutQueue,
    // Group E2EE G1: the MLS Delivery Service of group chats.
    GroupMlsGate,
    GroupE2eeService,
    // M3 (owner 25.11): the end of a file's check reaches its group message.
    { provide: GROUP_FILE_SCAN_LISTENER, useExisting: GroupsService },
  ],
  exports: [GroupsService],
})
export class GroupsModule {}

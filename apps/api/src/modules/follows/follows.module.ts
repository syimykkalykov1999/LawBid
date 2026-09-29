import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { BlocksModule } from '../blocks/blocks.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

/** docs/05 §6 follows (stage 5.5). */
@Module({
  // ProfilesModule: client rows of the followers list (OQ-026).
  imports: [
    UsageLimitsModule,
    NotificationsModule,
    FilesModule,
    ProfilesModule,
    // OQ-028: no follows across a block.
    BlocksModule,
  ],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}

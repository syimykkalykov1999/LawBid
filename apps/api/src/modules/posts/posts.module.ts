import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostEngagementService } from './post-engagement.service';
import { PostPresenter } from './post-presenter.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

/** docs/05 §3 posts (stage 5.2). PostPresenter is shared by the feed,
 * tags, search and saved lists. */
@Module({
  imports: [FilesModule, UsageLimitsModule, NotificationsModule],
  controllers: [PostsController],
  providers: [PostsService, PostPresenter, PostEngagementService],
  exports: [PostsService, PostPresenter, PostEngagementService],
})
export class PostsModule {}

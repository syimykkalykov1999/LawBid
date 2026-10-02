import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VideosModule } from '../videos/videos.module';
import { BunnyWebhookController } from './bunny-webhook.controller';
import { PostEngagementService } from './post-engagement.service';
import { PostVideosController } from './post-videos.controller';
import { PostVideosService } from './post-videos.service';
import { PostPresenter } from './post-presenter.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

/** docs/05 §3 posts (stage 5.2). PostPresenter is shared by the feed,
 * tags, search and saved lists. */
@Module({
  imports: [FilesModule, UsageLimitsModule, NotificationsModule, VideosModule],
  controllers: [PostsController, PostVideosController, BunnyWebhookController],
  providers: [
    PostsService,
    PostPresenter,
    PostEngagementService,
    PostVideosService,
  ],
  exports: [
    PostsService,
    PostPresenter,
    PostEngagementService,
    PostVideosService,
  ],
})
export class PostsModule {}

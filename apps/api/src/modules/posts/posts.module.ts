import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { FollowsModule } from '../follows/follows.module';
import { PromotionsCoreModule } from '../promotions/promotions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VideosModule } from '../videos/videos.module';
import { BunnyWebhookController } from './bunny-webhook.controller';
import { ContentFilterService } from './content-filter.service';
import { PostAttachmentsPolicy } from './post-attachments.policy';
import { PostEventsService } from './post-events.service';
import { PostInsightsService } from './post-insights.service';
import { PostEngagementService } from './post-engagement.service';
import { PostVideosController } from './post-videos.controller';
import { PostVideosService } from './post-videos.service';
import { PostPresenter } from './post-presenter.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

/** docs/05 §3 posts (stage 5.2). PostPresenter is shared by the feed,
 * tags, search and saved lists. */
@Module({
  imports: [
    FilesModule,
    FollowsModule,
    UsageLimitsModule,
    NotificationsModule,
    VideosModule,
    FeatureFlagsModule,
    PromotionsCoreModule,
  ],
  controllers: [PostsController, PostVideosController, BunnyWebhookController],
  providers: [
    PostsService,
    PostEventsService,
    PostInsightsService,
    PostPresenter,
    PostEngagementService,
    PostVideosService,
    ContentFilterService,
    PostAttachmentsPolicy,
  ],
  exports: [
    PostsService,
    PostEventsService,
    PostPresenter,
    PostEngagementService,
    PostVideosService,
    ContentFilterService,
    PostAttachmentsPolicy,
  ],
})
export class PostsModule {}

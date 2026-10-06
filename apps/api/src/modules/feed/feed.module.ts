import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { PromotionsCoreModule } from '../promotions/promotions.module';
import { FeedController } from './feed.controller';
import { FEED_PROVIDER } from './feed.provider';
import { FeedService } from './feed.service';

/** docs/05 §2 feed (stage 5.3). */
@Module({
  // Owner 2026-10-05: promoted posts in the feed.
  imports: [PostsModule, PromotionsCoreModule],
  controllers: [FeedController],
  providers: [
    FeedService,
    { provide: FEED_PROVIDER, useExisting: FeedService },
  ],
  exports: [FEED_PROVIDER],
})
export class FeedModule {}

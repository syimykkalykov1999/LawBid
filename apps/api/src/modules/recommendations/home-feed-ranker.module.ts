import { Global, Module } from '@nestjs/common';
import { HOME_FEED_RANKER } from '../../common/feed-ranking/home-feed-ranker';
import { RecommendationsModule } from './recommendations.module';
import { RecommendationsService } from './recommendations.service';

/**
 * Owner 25.11: the posts ranking as the home feed sees it
 * (HOME_FEED_RANKER). Global, so FeedService can take it without the feed
 * module importing the recommendations module.
 */
@Global()
@Module({
  imports: [RecommendationsModule],
  providers: [
    { provide: HOME_FEED_RANKER, useExisting: RecommendationsService },
  ],
  exports: [HOME_FEED_RANKER],
})
export class HomeFeedRankerModule {}

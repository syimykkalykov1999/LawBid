import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { QaSnapshotService } from './qa-snapshot.service';
import { RecommendationsService } from './recommendations.service';
import { PostRankerService } from './ranker/post-ranker.service';
import {
  CaseRankerService,
  ReelRankerService,
} from './ranker/feed-rankers.service';

/** Owner 2026-10-13: ranking of people, posts and cases for Search.
 * R-401 (2026-11-04): plus the nightly Q&A ranking snapshot.
 * F2 (2026-11-25): plus the learned second stage of the posts ranking;
 * owner 25.11: and of the reels and the attorneys' case feed. */
@Module({
  imports: [FeatureFlagsModule],
  providers: [
    RecommendationsService,
    QaSnapshotService,
    PostRankerService,
    ReelRankerService,
    CaseRankerService,
  ],
  exports: [
    RecommendationsService,
    QaSnapshotService,
    PostRankerService,
    ReelRankerService,
    CaseRankerService,
  ],
})
export class RecommendationsModule {}

import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { QaSnapshotService } from './qa-snapshot.service';
import { RecommendationsService } from './recommendations.service';

/** Owner 2026-10-13: ranking of people, posts and cases for Search.
 * R-401 (2026-11-04): plus the nightly Q&A ranking snapshot. */
@Module({
  imports: [FeatureFlagsModule],
  providers: [RecommendationsService, QaSnapshotService],
  exports: [RecommendationsService, QaSnapshotService],
})
export class RecommendationsModule {}

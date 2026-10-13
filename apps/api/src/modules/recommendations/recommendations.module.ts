import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';

/** Owner 2026-10-13: ranking of people, posts and cases for Search. */
@Module({
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

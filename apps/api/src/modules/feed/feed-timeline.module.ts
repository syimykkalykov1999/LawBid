import { Module } from '@nestjs/common';
import { FeedTimelineService } from './feed-timeline.service';

/** Item 23 (F1): the hybrid home timeline (fan-out on write + on read).
 * Only global providers (Prisma, Redis, settings), so the posts module,
 * the feed and the post-fanout worker can all import it. */
@Module({
  providers: [FeedTimelineService],
  exports: [FeedTimelineService],
})
export class FeedTimelineModule {}

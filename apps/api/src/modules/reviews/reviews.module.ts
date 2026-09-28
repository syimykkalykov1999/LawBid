import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewModerationService } from './review-moderation.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** docs/03_VERIFICATION_PROFILES.md §7 (stage 3.7): reviews API, rating
 * recalculation, review notifications. ReviewsService.requestReview is for
 * file 04's case closing; ReviewModerationService for file 06's
 * moderation. The reminder and nightly rating reconciliation run on the
 * `cron` queue (src/jobs). */
@Module({
  imports: [NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewModerationService],
  exports: [ReviewsService, ReviewModerationService],
})
export class ReviewsModule {}

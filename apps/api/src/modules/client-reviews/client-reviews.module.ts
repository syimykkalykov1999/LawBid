import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminReviewAppealsController } from './admin-review-appeals.controller';
import { ClientReviewsController } from './client-reviews.controller';
import { ClientReviewsService } from './client-reviews.service';

/** The reviews-of-clients service alone — what the worker's hourly
 * appeal sweep needs (no HTTP controllers, no admin guard). */
@Module({
  imports: [FilesModule, NotificationsModule],
  providers: [ClientReviewsService],
  exports: [ClientReviewsService],
})
export class ClientReviewsCoreModule {}

/** Owner 2026-09-30 (OQ-038, OQ-046): reviews of clients — the app's
 * endpoints and the admin appeal queue. */
@Module({
  imports: [ClientReviewsCoreModule],
  controllers: [ClientReviewsController, AdminReviewAppealsController],
})
export class ClientReviewsModule {}

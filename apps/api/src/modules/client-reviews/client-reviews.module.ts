import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminReviewAppealsController } from './admin-review-appeals.controller';
import { ClientReviewsController } from './client-reviews.controller';
import { ClientReviewsService } from './client-reviews.service';

/** Owner 2026-09-30 (OQ-038): attorneys' reviews of clients. */
@Module({
  imports: [FilesModule, NotificationsModule],
  controllers: [ClientReviewsController, AdminReviewAppealsController],
  providers: [ClientReviewsService],
  exports: [ClientReviewsService],
})
export class ClientReviewsModule {}

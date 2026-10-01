import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';

/** Owner 2026-09-30: content, bids, qualifications, broadcasts, CSV. */
@Module({
  imports: [AdminAccessModule, NotificationsModule],
  controllers: [AdminContentController],
  providers: [AdminContentService],
})
export class AdminContentModule {}

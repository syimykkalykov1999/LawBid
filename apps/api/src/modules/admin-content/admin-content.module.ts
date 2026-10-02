import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminContentExtrasService } from './admin-content-extras.service';
import { BroadcastFanoutModule } from './broadcast-fanout.module';

/** Owner 2026-09-30: content, bids, qualifications, broadcasts, CSV. */
@Module({
  imports: [
    AdminAccessModule,
    NotificationsModule,
    // Audit 2026-10-02: broadcasts fan out in the background.
    BroadcastFanoutModule.register({ mode: 'api' }),
  ],
  controllers: [AdminContentController],
  providers: [AdminContentService, AdminContentExtrasService],
  // Admin media (video takedown) reuses the post removal path.
  exports: [AdminContentService],
})
export class AdminContentModule {}

import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FilesModule } from '../files/files.module';
import { AdminPrivateContentController } from './admin-private-content.controller';
import { AdminPrivateContentService } from './admin-private-content.service';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AdminContentExtrasService } from './admin-content-extras.service';
import { AdminContentBulkService } from './admin-content-bulk.service';
import { BroadcastFanoutModule } from './broadcast-fanout.module';

/** Owner 2026-09-30: content, bids, qualifications, broadcasts, CSV. */
@Module({
  imports: [
    AdminAccessModule,
    NotificationsModule,
    // Owner 2026-10-28: signed links for private case files.
    FilesModule,
    // Audit 2026-10-02: broadcasts fan out in the background.
    BroadcastFanoutModule.register({ mode: 'api' }),
  ],
  controllers: [AdminContentController, AdminPrivateContentController],
  providers: [
    AdminContentService,
    AdminContentExtrasService,
    AdminContentBulkService,
    AdminPrivateContentService,
  ],
  // Admin media (video takedown) reuses the post removal path.
  exports: [AdminContentService],
})
export class AdminContentModule {}

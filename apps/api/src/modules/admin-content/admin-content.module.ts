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
import { AdminOverviewService } from './admin-overview.service';
import { BroadcastFanoutModule } from './broadcast-fanout.module';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list AdminOverviewService again (row 78 snapshot), so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  providers: [AdminOverviewService],
  exports: [AdminOverviewService],
})
export class AdminOverviewCoreModule {}

/** Owner 2026-09-30: content, bids, qualifications, broadcasts, CSV. */
@Module({
  imports: [
    AdminOverviewCoreModule,
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

import { Module } from '@nestjs/common';
import { PayLinkModule } from '../billing/pay-link.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientBadgeAdminService } from './client-badge-admin.service';
import {
  AdminClientBadgeController,
  ClientBadgeController,
} from './client-badge.controller';
import { ClientBadgeService } from './client-badge.service';

/** The badge service alone — imported by billing (webhook events). Uses
 * the global PAYMENT_PROVIDER. */
@Module({
  // PayLinkModule: the card page's links (owner 2026-10-22).
  imports: [FilesModule, NotificationsModule, PayLinkModule],
  providers: [ClientBadgeService],
  exports: [ClientBadgeService],
})
export class ClientBadgeCoreModule {}

/** Owner 2026-10-02: the client badge endpoints of the app and the admin. */
@Module({
  imports: [
    ClientBadgeCoreModule,
    AdminAccessModule,
    FilesModule,
    NotificationsModule,
  ],
  controllers: [ClientBadgeController, AdminClientBadgeController],
  providers: [ClientBadgeAdminService],
})
export class ClientBadgeModule {}

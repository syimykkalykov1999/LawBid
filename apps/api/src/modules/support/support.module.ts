import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { SupportFilesService } from './support-files.service';
import { SupportDeskService } from './support-desk.service';
import { SupportTeamService } from './support-team.service';
import { SupportController, SupportInfoController } from './support.controller';
import { SupportService } from './support.service';

/** Owner 2026-10-02: support tickets (app) and the admin support queue;
 * 2026-10-05: support 24/7 (SLA, shifts, ready answers, auto-reply). */
@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    SubscriptionsModule,
    AdminAccessModule,
    FilesModule,
  ],
  controllers: [
    SupportController,
    SupportInfoController,
    AdminSupportController,
  ],
  providers: [
    SupportService,
    AdminSupportService,
    SupportDeskService,
    SupportTeamService,
    SupportFilesService,
  ],
  // AdminSupportService: «ИИ-сотрудник» sends the owner-approved reply
  // through the same path as the support page (owner 2026-11-12, row 51).
  exports: [SupportDeskService, SupportTeamService, AdminSupportService],
})
export class SupportModule {}

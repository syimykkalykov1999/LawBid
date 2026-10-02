import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/** Owner 2026-10-02: support tickets (app) and the admin support queue. */
@Module({
  imports: [AuthModule, NotificationsModule, SubscriptionsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminSupportService],
})
export class SupportModule {}

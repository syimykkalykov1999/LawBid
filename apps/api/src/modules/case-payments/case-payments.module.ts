import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { ChatSystemModule } from '../chat/chat-system.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminCasePaymentsController } from './admin-case-payments.controller';
import { AdminCasePaymentsService } from './admin-case-payments.service';
import { CasePaymentsController } from './case-payments.controller';
import { CasePaymentsService } from './case-payments.service';

/** The payments service alone — imported by billing (Connect webhooks),
 * the jobs module (`case-payments.expire`) and the HTTP module below.
 * Uses the global PAYMENT_PROVIDER when present. */
@Module({
  imports: [
    FeatureFlagsModule,
    FilesModule,
    NotificationsModule,
    ChatSystemModule,
  ],
  providers: [CasePaymentsService],
  exports: [CasePaymentsService],
})
export class CasePaymentsCoreModule {}

/** Owner 2026-10-05: client → attorney payment endpoints of the app and
 * the admin. */
@Module({
  imports: [CasePaymentsCoreModule, FeatureFlagsModule, AdminAccessModule],
  controllers: [CasePaymentsController, AdminCasePaymentsController],
  providers: [AdminCasePaymentsService],
})
export class CasePaymentsModule {}

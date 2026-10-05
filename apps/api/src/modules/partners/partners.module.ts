import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminPartnersController } from './admin-partners.controller';
import { AdminPartnersService } from './admin-partners.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/** The partner service alone — imported by ReferralsCoreModule (accruals
 * on qualifying events), billing (refunds) and the worker (daily sweep). */
@Module({
  imports: [NotificationsModule],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersCoreModule {}

/** Owner 2026-10-05: partner program endpoints of the app and the admin. */
@Module({
  imports: [PartnersCoreModule, AdminAccessModule],
  controllers: [PartnersController, AdminPartnersController],
  providers: [AdminPartnersService],
})
export class PartnersModule {}

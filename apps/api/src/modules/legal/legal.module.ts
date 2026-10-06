import { Module } from '@nestjs/common';
import { UsageLimitsModule } from '../../common/usage-limits/usage-limits.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminLegalController } from './admin-legal.controller';
import { DmcaService } from './dmca.service';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

/**
 * Owner 2026-10-05 (legal): legal settings (DMCA agent, incident contact,
 * disclaimers, partner rules) and DMCA notices. ModerationModule is
 * global (ModerationService + AdminModerationService for remove /
 * restore); AdminUsersModule brings the suspension of repeat infringers.
 */
@Module({
  imports: [
    AdminAccessModule,
    AdminUsersModule,
    ReportsModule,
    UsageLimitsModule,
  ],
  controllers: [LegalController, AdminLegalController],
  providers: [LegalService, DmcaService],
  exports: [LegalService],
})
export class LegalModule {}

import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPayrollModule } from '../admin-payroll/admin-payroll.module';
import { AuthModule } from '../auth/auth.module';
import {
  AdminCountryPartnersController,
  CountryPartnerPortalController,
} from './admin-country-partners.controller';
import { AdminCountryPartnersService } from './admin-country-partners.service';
import { CountryPartnersService } from './country-partners.service';

/** Settlements and goals — imported by the worker (daily sweep) too.
 * Uses the one shared PayrollAccrualsService so payout listeners fire. */
@Module({
  imports: [AuthModule, AdminPayrollModule],
  providers: [CountryPartnersService],
  exports: [CountryPartnersService],
})
export class CountryPartnersCoreModule {}

/** Owner 2026-10-06: Деньги → Партнёры стран and the partner's page. */
@Module({
  imports: [CountryPartnersCoreModule, AdminAccessModule],
  controllers: [AdminCountryPartnersController, CountryPartnerPortalController],
  providers: [AdminCountryPartnersService],
})
export class CountryPartnersModule {}

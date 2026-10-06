import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { PayrollAccrualsService } from '../admin-payroll/payroll-accruals.service';
import { AuthModule } from '../auth/auth.module';
import {
  AdminCountryPartnersController,
  CountryPartnerPortalController,
} from './admin-country-partners.controller';
import { AdminCountryPartnersService } from './admin-country-partners.service';
import { CountryPartnersService } from './country-partners.service';

/** Settlements and goals — imported by the worker (daily sweep) too.
 * PayrollAccrualsService is stateless for accrue/cancel, so its own copy
 * here writes to the same payroll ledger. */
@Module({
  imports: [AuthModule],
  providers: [CountryPartnersService, PayrollAccrualsService],
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

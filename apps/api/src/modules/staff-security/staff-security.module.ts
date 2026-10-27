import { Module } from '@nestjs/common';
import { StaffAnomaliesJob } from '../../jobs/handlers/staff-anomalies.job';
import { StaffSecurityController } from './staff-security.controller';

/**
 * Staff package (T11): data protection for staff (reveal, export block, card limit, anomalies).
 * Core part (providers, the cron jobs), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [StaffAnomaliesJob],
  exports: [StaffAnomaliesJob],
})
export class StaffSecurityCoreModule {}

/** Staff package (T11): the admin routes of staff-security (API only). */
@Module({
  imports: [StaffSecurityCoreModule],
  controllers: [StaffSecurityController],
})
export class StaffSecurityModule {}

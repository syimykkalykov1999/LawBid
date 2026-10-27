import { Global, Module } from '@nestjs/common';
import { StaffAnomaliesJob } from '../../jobs/handlers/staff-anomalies.job';
import { STAFF_SECURITY } from '../staff-core/staff-security.port';
import { StaffAnomalyService } from './staff-anomaly.service';
import { StaffCardWatch } from './staff-card-watch';
import { StaffSecurityController } from './staff-security.controller';
import { StaffSecurityService } from './staff-security.service';

/**
 * Staff package (T11): data protection for staff (masking + reveal, export
 * block, session rules, opened-card counter, anomalies).
 * Core part (the counters, the report and the cron job), imported by
 * StaffModule (API) and JobsModule (API + worker). Everything stays a
 * no-op while its switch is off.
 */
@Module({
  providers: [StaffCardWatch, StaffAnomalyService, StaffAnomaliesJob],
  exports: [StaffCardWatch, StaffAnomalyService, StaffAnomaliesJob],
})
export class StaffSecurityCoreModule {}

/**
 * Staff package (T11): the API side. Global because the admin guard and the
 * admin response interceptor, instantiated inside every module that owns an
 * `/admin/*` controller, reach it through the STAFF_SECURITY token.
 */
@Global()
@Module({
  imports: [StaffSecurityCoreModule],
  controllers: [StaffSecurityController],
  providers: [
    StaffSecurityService,
    { provide: STAFF_SECURITY, useExisting: StaffSecurityService },
  ],
  exports: [STAFF_SECURITY, StaffSecurityService],
})
export class StaffSecurityModule {}

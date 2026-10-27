import { Global, Module } from '@nestjs/common';
import { StaffHeadScoreJob } from '../../jobs/handlers/staff-head-score.job';
import { StaffRetaliationExpireJob } from '../../jobs/handlers/staff-retaliation-expire.job';
import {
  RETALIATION_PORT,
  NoopRetaliationPort,
} from '../staff-core/retaliation.port';
import { StaffAppealsController } from './staff-appeals.controller';

/**
 * Staff package (T6): complaints against a head (super admin only, everyone else 404), the retaliation guard, head score.
 * Core part (providers, the cron jobs, the port binding), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off. Global so any module can inject RETALIATION_PORT without an import.
 */
@Global()
@Module({
  providers: [
    StaffHeadScoreJob,
    StaffRetaliationExpireJob,
    { provide: RETALIATION_PORT, useClass: NoopRetaliationPort },
  ],
  exports: [StaffHeadScoreJob, StaffRetaliationExpireJob, RETALIATION_PORT],
})
export class StaffAppealsCoreModule {}

/** Staff package (T6): the admin routes of staff-appeals (API only). */
@Module({
  imports: [StaffAppealsCoreModule],
  controllers: [StaffAppealsController],
})
export class StaffAppealsModule {}

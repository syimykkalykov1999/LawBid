import { Global, Module } from '@nestjs/common';
import { StaffHeadScoreJob } from '../../jobs/handlers/staff-head-score.job';
import { StaffRetaliationExpireJob } from '../../jobs/handlers/staff-retaliation-expire.job';
import { RETALIATION_PORT } from '../staff-core/retaliation.port';
import {
  PendingAdminActions,
  STAFF_ADMIN_ACTIONS,
} from './staff-admin-actions.port';
import {
  StaffAppealsAuthorController,
  StaffAppealsController,
} from './staff-appeals.controller';
import { StaffAppealsService } from './staff-appeals.service';
import { StaffHeadScoreService } from './staff-head-score.service';
import { StaffRetaliationService } from './staff-retaliation.service';

/**
 * Staff package (T6): complaints against a head (super admin only, everyone
 * else 404), the retaliation guard, head score.
 * Core part (providers, the cron jobs, the port binding), imported by
 * StaffModule (API) and JobsModule (API + worker). Everything stays a
 * no-op while `staff.appeals_enabled` / `staff.head_enabled` are off.
 * Global so any module (T2's admin management) can inject RETALIATION_PORT
 * without an import.
 */
@Global()
@Module({
  providers: [
    StaffHeadScoreJob,
    StaffRetaliationExpireJob,
    StaffRetaliationService,
    StaffHeadScoreService,
    { provide: RETALIATION_PORT, useExisting: StaffRetaliationService },
  ],
  exports: [
    StaffHeadScoreJob,
    StaffRetaliationExpireJob,
    RETALIATION_PORT,
    StaffRetaliationService,
  ],
})
export class StaffAppealsCoreModule {}

/** Staff package (T6): the admin routes of staff-appeals (API only). */
@Module({
  imports: [StaffAppealsCoreModule],
  controllers: [StaffAppealsController, StaffAppealsAuthorController],
  providers: [
    StaffAppealsService,
    // TODO(T2 merged): bind to an adapter over AdminsService.setEnabled /
    // the offboard service (see staff-admin-actions.port.ts).
    { provide: STAFF_ADMIN_ACTIONS, useClass: PendingAdminActions },
  ],
})
export class StaffAppealsModule {}

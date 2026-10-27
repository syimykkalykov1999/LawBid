import { Global, Module } from '@nestjs/common';
import { StaffHeadScoreJob } from '../../jobs/handlers/staff-head-score.job';
import { StaffRetaliationExpireJob } from '../../jobs/handlers/staff-retaliation-expire.job';
import { RETALIATION_PORT } from '../staff-core/retaliation.port';
import { AdminModule } from '../admin/admin.module';
import { StaffAdminActionsAdapter } from './staff-admin-actions.adapter';
import { STAFF_ADMIN_ACTIONS } from './staff-admin-actions.port';
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
  imports: [StaffAppealsCoreModule, AdminModule],
  controllers: [StaffAppealsController, StaffAppealsAuthorController],
  providers: [
    StaffAppealsService,
    // T10: both follow-ups are AdminsService.setEnabled(false).
    StaffAdminActionsAdapter,
    { provide: STAFF_ADMIN_ACTIONS, useExisting: StaffAdminActionsAdapter },
  ],
  exports: [StaffAdminActionsAdapter],
})
export class StaffAppealsModule {}

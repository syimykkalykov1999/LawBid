import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AttorneyTrustCoreModule } from '../attorney-trust/attorney-trust.module';
import { AdminCountsController } from './admin-counts.controller';
import { AdminCountsService } from './admin-counts.service';
import { AdminRoleTemplatesController } from './admin-role-templates.controller';
import { AdminRoleTemplatesService } from './admin-role-templates.service';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminSessionsService } from './admin-sessions.service';
import { AdminAuditJobsModule } from './admin-audit-jobs.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogQueryService } from './audit-log.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list DashboardService again (the dashboard snapshot), so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardCoreModule {}

/** docs/06 §2.3 items 1, 12, 13 (stage 6.2): dashboard, audit log,
 * administrators. The other sections live with their domain modules. */
@Module({
  imports: [
    DashboardCoreModule,
    AdminAccessModule,
    AdminAuthModule,
    AttorneyTrustCoreModule,
    AdminAuditJobsModule,
  ],
  controllers: [
    DashboardController,
    AdminCountsController,
    AuditLogController,
    AdminRoleTemplatesController,
    AdminsController,
    AdminSessionsController,
  ],
  providers: [
    AdminCountsService,
    AuditLogQueryService,
    AdminsService,
    AdminRoleTemplatesService,
    AdminSessionsService,
  ],
  // Staff package T10: the staff cockpit ends a person's work through the
  // same call as the administrators' page. Speed matrix 2026-11-09 (§3 #5):
  // the admin socket gateway refreshes the sidebar counts for connected tabs.
  exports: [AdminsService, AdminCountsService],
})
export class AdminModule {}

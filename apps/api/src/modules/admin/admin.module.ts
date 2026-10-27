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

/** docs/06 §2.3 items 1, 12, 13 (stage 6.2): dashboard, audit log,
 * administrators. The other sections live with their domain modules. */
@Module({
  imports: [
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
    DashboardService,
    AdminCountsService,
    AuditLogQueryService,
    AdminsService,
    AdminRoleTemplatesService,
    AdminSessionsService,
  ],
  // Staff package T10: the staff cockpit ends a person's work through the
  // same call as the administrators' page.
  exports: [AdminsService],
})
export class AdminModule {}

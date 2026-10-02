import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminRoleTemplatesController } from './admin-role-templates.controller';
import { AdminRoleTemplatesService } from './admin-role-templates.service';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';
import { AdminSessionsController } from './admin-sessions.controller';
import { AdminSessionsService } from './admin-sessions.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogQueryService } from './audit-log.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** docs/06 §2.3 items 1, 12, 13 (stage 6.2): dashboard, audit log,
 * administrators. The other sections live with their domain modules. */
@Module({
  imports: [AdminAccessModule],
  controllers: [
    DashboardController,
    AuditLogController,
    AdminRoleTemplatesController,
    AdminsController,
    AdminSessionsController,
  ],
  providers: [
    DashboardService,
    AuditLogQueryService,
    AdminsService,
    AdminRoleTemplatesService,
    AdminSessionsService,
  ],
})
export class AdminModule {}

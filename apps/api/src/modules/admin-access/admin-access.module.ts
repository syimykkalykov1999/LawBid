import { Module } from '@nestjs/common';
import { AdminRolesGuard } from './admin-roles.guard';
import { AuditLogService } from './audit-log.service';

/** Interim admin RBAC + audit writer (see AdminRolesGuard). docs/06 stage
 * 6.2 replaces the guard with the admin-JWT AdminAuthGuard/@Roles. */
@Module({
  providers: [AdminRolesGuard, AuditLogService],
  exports: [AdminRolesGuard, AuditLogService],
})
export class AdminAccessModule {}

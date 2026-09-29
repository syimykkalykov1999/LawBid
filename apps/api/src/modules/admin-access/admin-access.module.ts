import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

/** Append-only audit_log writer shared by every admin-facing service.
 * Guards/RBAC live in modules/admin-auth (docs/06 stage 6.2). */
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AdminAccessModule {}

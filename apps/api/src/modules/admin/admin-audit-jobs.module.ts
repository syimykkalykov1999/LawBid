import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminAccessReportService } from './admin-access-report.service';
import { AuditExportService } from './audit-export.service';

/** Owner 2026-10-28: the daily audit export and the monthly access report,
 * shared by the admin API (report page) and the cron worker. */
@Module({
  imports: [AdminAccessModule],
  providers: [AuditExportService, AdminAccessReportService],
  exports: [AuditExportService, AdminAccessReportService],
})
export class AdminAuditJobsModule {}

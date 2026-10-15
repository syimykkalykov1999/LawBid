import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import {
  AdminCrashesController,
  CrashReportsController,
} from './crash-reports.controller';
import { CrashReportsService } from './crash-reports.service';

/** Owner 2026-10-15: the app's own crash reports (free, in our database). */
@Module({
  imports: [AdminAccessModule],
  controllers: [CrashReportsController, AdminCrashesController],
  providers: [CrashReportsService],
  exports: [CrashReportsService],
})
export class CrashReportsModule {}

import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { RateLimitService } from '../auth/auth.public';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import {
  AdminCrashesController,
  CrashReportsController,
} from './crash-reports.controller';
import { CrashReportsService } from './crash-reports.service';

/**
 * Holes re-check (25.11, item 17): provided ONCE, here. JobsModule used to
 * list this service again, so the API process ran a second instance (Nest:
 * a provider belongs to one module, others import it). JobsModule imports
 * this module; jobs.module.spec.ts fails on any copy.
 */
@Module({
  imports: [FeatureFlagsModule],
  providers: [CrashReportsService, RateLimitService],
  exports: [CrashReportsService],
})
export class CrashReportsCoreModule {}

/** Owner 2026-10-15: the app's own crash reports (free, in our database). */
@Module({
  imports: [CrashReportsCoreModule, AdminAccessModule, FeatureFlagsModule],
  controllers: [CrashReportsController, AdminCrashesController],
  exports: [CrashReportsCoreModule],
})
export class CrashReportsModule {}

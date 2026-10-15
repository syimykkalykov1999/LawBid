import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AnalyticsController } from './analytics.controller';
import { AppEventsController } from './app-events.controller';
import { AppEventsService } from './app-events.service';
import { AnalyticsService } from './analytics.service';

/** Owner 2026-10-15: own analytics (free, in our database). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule],
  controllers: [AnalyticsController, AppEventsController],
  providers: [AnalyticsService, AppEventsService],
  exports: [AnalyticsService, AppEventsService],
})
export class AnalyticsModule {}

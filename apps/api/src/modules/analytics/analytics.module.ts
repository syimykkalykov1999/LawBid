import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from '../auth/auth.public';
import { AnalyticsConsentService } from './analytics-consent.service';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AnalyticsController } from './analytics.controller';
import { AppEventsController } from './app-events.controller';
import { AppEventsService } from './app-events.service';
import { AnalyticsService } from './analytics.service';
import { ClientSliMetricsService } from './client-sli-metrics.service';

/**
 * Pack C (round 2 #8/#22, 25.11): the analytics services, provided ONCE.
 * JobsModule used to list AnalyticsService again — a second copy in the API
 * process, without the consent check (AnalyticsConsentService was not in
 * its providers).
 */
@Module({
  imports: [FeatureFlagsModule],
  providers: [
    AnalyticsService,
    AppEventsService,
    AnalyticsConsentService,
    // Б6: client SLIs and web vitals (minute log line, no table).
    ClientSliMetricsService,
  ],
  exports: [AnalyticsService, AppEventsService, AnalyticsConsentService],
})
export class AnalyticsCoreModule {}

/** Owner 2026-10-15: own analytics (free, in our database). */
@Module({
  // Owner 2026-10-22: TokenService (stateless) reads the optional bearer
  // of the public events endpoint — AuthModule itself is not imported
  // (UsersModule imports this module; no cycle).
  imports: [
    AnalyticsCoreModule,
    AdminAccessModule,
    FeatureFlagsModule,
    JwtModule.register({}),
  ],
  controllers: [AnalyticsController, AppEventsController],
  providers: [TokenService],
  exports: [AnalyticsCoreModule],
})
export class AnalyticsModule {}

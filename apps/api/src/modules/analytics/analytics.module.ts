import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from '../auth/services/token.service';
import { AnalyticsConsentService } from './analytics-consent.service';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AnalyticsController } from './analytics.controller';
import { AppEventsController } from './app-events.controller';
import { AppEventsService } from './app-events.service';
import { AnalyticsService } from './analytics.service';

/** Owner 2026-10-15: own analytics (free, in our database). */
@Module({
  // Owner 2026-10-22: TokenService (stateless) reads the optional bearer
  // of the public events endpoint — AuthModule itself is not imported
  // (UsersModule imports this module; no cycle).
  imports: [AdminAccessModule, FeatureFlagsModule, JwtModule.register({})],
  controllers: [AnalyticsController, AppEventsController],
  providers: [
    AnalyticsService,
    AppEventsService,
    AnalyticsConsentService,
    TokenService,
  ],
  exports: [AnalyticsService, AppEventsService, AnalyticsConsentService],
})
export class AnalyticsModule {}

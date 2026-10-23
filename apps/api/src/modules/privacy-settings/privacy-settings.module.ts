import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrivacySettingsController } from './privacy-settings.controller';
import { PrivacySettingsService } from './privacy-settings.service';

/** Owner 2026-10-20: audiences for last seen, new chats and calls. */
@Module({
  // Owner 2026-10-22: the CCPA switch drops the analytics-consent cache.
  imports: [AnalyticsModule],
  controllers: [PrivacySettingsController],
  providers: [PrivacySettingsService],
  exports: [PrivacySettingsService],
})
export class PrivacySettingsModule {}

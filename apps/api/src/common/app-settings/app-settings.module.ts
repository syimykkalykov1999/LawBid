import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../../modules/admin-access/admin-access.module';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { AppSettingsService } from './app-settings.service';
import { AppSettingsWriter } from './app-settings.writer';
import { ConfigRolloutService } from './config-rollout.service';
import { TextLimitsService } from './text-limits.service';

@Global()
@Module({
  imports: [FeatureFlagsModule, AdminAccessModule],
  providers: [
    AppSettingsService,
    AppSettingsWriter,
    TextLimitsService,
    ConfigRolloutService,
  ],
  exports: [
    AppSettingsService,
    AppSettingsWriter,
    TextLimitsService,
    ConfigRolloutService,
  ],
})
export class AppSettingsModule {}

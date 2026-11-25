import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../../modules/admin-access/admin-access.module';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { AppSettingsService } from './app-settings.service';
import { AppSettingsWriter } from './app-settings.writer';
import { ConfigRolloutService } from './config-rollout.service';
import { TextLimitsService } from './text-limits.service';
import { CodeChannelService } from './code-channel.service';

@Global()
@Module({
  imports: [FeatureFlagsModule, AdminAccessModule],
  providers: [
    AppSettingsService,
    AppSettingsWriter,
    TextLimitsService,
    ConfigRolloutService,
    // Owner 25.11: `auth.code_channel` (SMS / почта / Авто).
    CodeChannelService,
  ],
  exports: [
    AppSettingsService,
    AppSettingsWriter,
    TextLimitsService,
    ConfigRolloutService,
    CodeChannelService,
  ],
})
export class AppSettingsModule {}

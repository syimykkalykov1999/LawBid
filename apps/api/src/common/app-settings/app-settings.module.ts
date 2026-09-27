import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { AppSettingsService } from './app-settings.service';

@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}

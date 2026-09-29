import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminConfigController } from './admin-config.controller';
import { AdminConfigService } from './admin-config.service';

/** docs/06 §2.3 items 7–10 (stage 6.6): flags, app_config, languages,
 * legal documents. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule],
  controllers: [AdminConfigController],
  providers: [AdminConfigService],
})
export class AdminConfigModule {}

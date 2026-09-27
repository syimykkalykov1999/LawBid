import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { CostGuardService } from './cost-guard.service';

/**
 * Global so any feature module that talks to a paid provider (auth OTP
 * today; identity checks, uploads, maps later) can inject
 * CostGuardService without re-importing it. Imports FeatureFlagsModule
 * only for AppConfigService (caps live in app_config).
 */
@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [CostGuardService],
  exports: [CostGuardService],
})
export class CostGuardModule {}

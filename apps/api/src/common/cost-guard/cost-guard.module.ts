import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { CostAutoscaleService } from './cost-autoscale.service';
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
  // Owner 2026-10-05: caps in mode «Авто» follow real usage (hourly
  // `cost.autoscale` cron + once after boot).
  providers: [CostGuardService, CostAutoscaleService],
  exports: [CostGuardService, CostAutoscaleService],
})
export class CostGuardModule {}

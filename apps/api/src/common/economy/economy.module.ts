import { Global, Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../../modules/feature-flags/feature-flags.module';
import { EconomyService } from './economy.service';

/** Owner 2026-10-16: the economy guard (`economy.guard` cron, admin card
 * «Экономика»). Global like CostGuardModule / OpsModule it builds on. */
@Global()
@Module({
  imports: [FeatureFlagsModule],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}

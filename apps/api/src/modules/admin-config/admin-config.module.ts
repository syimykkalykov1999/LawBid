import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminConfigController } from './admin-config.controller';
import { AdminBudgetsService } from './admin-budgets.service';
import { AdminConfigService } from './admin-config.service';

/** docs/06 §2.3 items 7–10 (stage 6.6): flags, app_config, languages,
 * legal documents. */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule],
  controllers: [AdminConfigController],
  // AdminBudgetsService: «Лимиты расходов» (CostAutoscaleService comes
  // from the global CostGuardModule).
  providers: [AdminConfigService, AdminBudgetsService],
  // Owner 2026-10-05: the trust-levels page edits its `trust.*` keys
  // through the same validated, audited path.
  exports: [AdminConfigService],
})
export class AdminConfigModule {}

import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminLaunchController } from './admin-launch.controller';
import { AdminSpendController } from './admin-spend.controller';
import { CostRegistryService } from './cost-registry.service';

/**
 * Owner 2026-10-24: «Запуск» (launch checklist, PagerDuty, AWS budgets) and
 * «Расходы» (spend per service). The services live in OpsModule (global) so
 * the worker's usage poll can use them too.
 */
@Module({
  imports: [AdminAccessModule],
  controllers: [AdminLaunchController, AdminSpendController],
  providers: [CostRegistryService],
})
export class AdminLaunchModule {}

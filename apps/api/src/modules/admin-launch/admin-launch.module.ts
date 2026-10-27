import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminLaunchController } from './admin-launch.controller';
import { AdminSpendController } from './admin-spend.controller';
import { CostRegistryService } from './cost-registry.service';
import { AdminInfraController } from './infra/admin-infra.controller';
import { InfraChangeService } from './infra/infra-change.service';
import { InfraGithubClient } from './infra/infra-github.client';
import { InfraWorkflowController } from './infra/infra-workflow.controller';

/**
 * Owner 2026-10-24: «Запуск» (launch checklist, PagerDuty, AWS budgets) and
 * «Расходы» (spend per service). The services live in OpsModule (global) so
 * the worker's usage poll can use them too.
 * Owner 2026-10-26: infra switches from the admin (infra/): Выкл / Вкл on a
 * Terraform row → GitHub plan → 2FA → apply (docs/runbooks/infra-from-admin.md).
 */
@Module({
  imports: [AdminAccessModule],
  controllers: [
    AdminLaunchController,
    AdminSpendController,
    AdminInfraController,
    InfraWorkflowController,
  ],
  providers: [CostRegistryService, InfraChangeService, InfraGithubClient],
  // Owner 2026-10-27: «Продвижение» starts a SEO dry run through the same App.
  exports: [InfraGithubClient],
})
export class AdminLaunchModule {}

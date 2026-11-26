import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminLaunchModule } from '../admin-launch/admin-launch.module';
import { AdminIntegrationsController } from './admin-integrations.controller';

/** Owner 2026-10-01: Admin → Integrations & API keys (super_admin). */
@Module({
  // 26.11: «Включить» on the R2 backup key starts its dry run (GitHub App).
  imports: [AdminAccessModule, AdminLaunchModule],
  controllers: [AdminIntegrationsController],
})
export class AdminIntegrationsModule {}

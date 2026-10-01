import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminIntegrationsController } from './admin-integrations.controller';

/** Owner 2026-10-01: Admin → Integrations & API keys (super_admin). */
@Module({
  imports: [AdminAccessModule],
  controllers: [AdminIntegrationsController],
})
export class AdminIntegrationsModule {}

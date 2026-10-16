import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminConfigModule } from '../admin-config/admin-config.module';
import { AdminEconomyController } from './admin-economy.controller';

/** Owner 2026-10-16: Система → «Экономика» (super admin only). The
 * numbers and the 5-minute job live in common/economy (EconomyModule). */
@Module({
  imports: [AdminAccessModule, AdminConfigModule],
  controllers: [AdminEconomyController],
})
export class AdminEconomyModule {}

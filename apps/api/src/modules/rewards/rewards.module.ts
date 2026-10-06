import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminPayrollCoreModule } from '../admin-payroll/admin-payroll.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AdminRewardsController } from './admin-rewards.controller';
import { RewardsService } from './rewards.service';

/** Owner 2026-10-05: «Лучший сотрудник» (Люди → Поощрения). */
@Module({
  imports: [
    AdminAccessModule,
    AdminPayrollCoreModule,
    AuthModule,
    FeatureFlagsModule,
  ],
  controllers: [AdminRewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

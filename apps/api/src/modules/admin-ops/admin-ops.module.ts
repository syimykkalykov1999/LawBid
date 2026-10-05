import { Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { AdminOpsController } from './admin-ops.controller';
import { SystemHealthService } from './system-health.service';

/** Owner 2026-10-05: Система → Здоровье системы (zero maintenance). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, FilesModule],
  controllers: [AdminOpsController],
  providers: [SystemHealthService],
})
export class AdminOpsModule {}

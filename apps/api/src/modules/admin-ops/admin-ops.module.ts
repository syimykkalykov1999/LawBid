import { Module } from '@nestjs/common';
import { MessageReencryptJob } from '../../jobs/handlers/message-reencrypt.job';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { AdminOpsController } from './admin-ops.controller';
import { AdminStatusPageController } from './admin-status-page.controller';
import { ScaleService } from './scale.service';
import { SystemHealthService } from './system-health.service';

/** Owner 2026-10-05: Система → Здоровье системы (zero maintenance). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, FilesModule],
  controllers: [AdminOpsController, AdminStatusPageController],
  // The re-encryption job here only reads / resets its Redis progress.
  providers: [SystemHealthService, MessageReencryptJob, ScaleService],
})
export class AdminOpsModule {}

import { Module } from '@nestjs/common';
import { MessageReencryptJob } from '../../jobs/handlers/message-reencrypt.job';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { AdminOpsController } from './admin-ops.controller';
import { AdminStatusPageController } from './admin-status-page.controller';
import { BackfillsService } from './backfills.service';
import { HeavyHittersReportService } from './heavy-hitters-report.service';
import { RestoreDrillService } from './restore-drill.service';
import { PartitionService } from '../../partitioning/partition.service';
import { QueueAdminService } from './queue-admin.service';
import { SearchIndexController } from './search-index.controller';
import { SearchModule } from '../search/search.module';
import { ScaleService } from './scale.service';
import { SystemHealthService } from './system-health.service';

/** Owner 2026-10-05: Система → Здоровье системы (zero maintenance). */
@Module({
  imports: [AdminAccessModule, FeatureFlagsModule, FilesModule, SearchModule],
  controllers: [
    AdminOpsController,
    AdminStatusPageController,
    SearchIndexController,
  ],
  // The re-encryption job here only reads / resets its Redis progress.
  providers: [
    SystemHealthService,
    MessageReencryptJob,
    ScaleService,
    BackfillsService,
    HeavyHittersReportService,
    RestoreDrillService,
    PartitionService,
    QueueAdminService,
  ],
})
export class AdminOpsModule {}

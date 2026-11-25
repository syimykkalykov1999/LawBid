import { Module } from '@nestjs/common';
import { MessageReencryptJobModule } from '../../jobs/handlers/message-reencrypt.module';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FilesModule } from '../files/files.module';
import { AdminOpsController } from './admin-ops.controller';
import { AdminStatusPageController } from './admin-status-page.controller';
import { BackfillsService } from './backfills.service';
import { HeavyHittersReportService } from './heavy-hitters-report.service';
import { RestoreDrillService } from './restore-drill.service';
import { PartitionCoreModule } from '../../partitioning/partition.module';
import { QueueAdminService } from './queue-admin.service';
import { SearchIndexController } from './search-index.controller';
import { SearchModule } from '../search/search.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { ScaleService } from './scale.service';
import { SystemHealthService } from './system-health.service';

/** Owner 2026-10-05: Система → Здоровье системы (zero maintenance). */
@Module({
  imports: [
    AdminAccessModule,
    FeatureFlagsModule,
    FilesModule,
    SearchModule,
    // R-401: the Q&A ranking snapshot («Пересчитать сейчас»).
    RecommendationsModule,
    // Holes re-check (25.11, item 17): one instance each, shared with
    // JobsModule (it runs the job and the partition maintenance).
    MessageReencryptJobModule,
    PartitionCoreModule,
  ],
  controllers: [
    AdminOpsController,
    AdminStatusPageController,
    SearchIndexController,
  ],
  // The re-encryption job (MessageReencryptJobModule) is only read / reset
  // here (its Redis progress).
  providers: [
    SystemHealthService,
    ScaleService,
    BackfillsService,
    HeavyHittersReportService,
    RestoreDrillService,
    QueueAdminService,
  ],
})
export class AdminOpsModule {}

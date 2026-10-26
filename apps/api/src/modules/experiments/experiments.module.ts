import { Global, Module } from '@nestjs/common';
import { AdminAccessModule } from '../admin-access/admin-access.module';
import { AdminExperimentsController } from './admin-experiments.controller';
import { AdminExperimentsService } from './admin-experiments.service';
import { ExperimentMetricsService } from './experiment-metrics.service';
import { ExperimentsNightlyJob } from './experiments-nightly.job';
import { ExperimentsService } from './experiments.service';
import { RankingEventsService } from './ranking-events.service';
import { RankingReplayService } from './ranking-replay';

/**
 * A/B experiments and the ranking events log (owner 2026-10-25,
 * docs/architecture/EXPERIMENTS.md). Global: any service can inject
 * ExperimentsService (`variant(user, key)`) and RankingEventsService
 * (`logImpression` / `logAction`) without importing anything. The cron job
 * (`experiments.metrics`) lives in the worker through the same providers.
 */
@Global()
@Module({
  imports: [AdminAccessModule],
  providers: [
    ExperimentsService,
    RankingEventsService,
    ExperimentMetricsService,
    ExperimentsNightlyJob,
    RankingReplayService,
    AdminExperimentsService,
  ],
  exports: [
    ExperimentsService,
    RankingEventsService,
    ExperimentsNightlyJob,
    RankingReplayService,
    AdminExperimentsService,
  ],
})
export class ExperimentsCoreModule {}

/** The admin routes (API process only). */
@Module({
  imports: [AdminAccessModule, ExperimentsCoreModule],
  controllers: [AdminExperimentsController],
})
export class AdminExperimentsModule {}

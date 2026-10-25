import { Global, Module } from '@nestjs/common';
import { AwsCapacityService } from './aws-capacity.service';
import { AwsOpsService } from './aws-ops.service';
import { HttpStatsService } from './http-stats.service';
import { RealtimeStatsService } from './realtime-stats.service';
import { OpsStateService } from './ops-state.service';
import { IncidentsService } from './status/incidents.service';
import { PublicStatusService } from './status/public-status.service';
import { StatusProbesService } from './status/status-probes.service';

/** Owner 2026-10-05: zero-maintenance operations, shared by the API and
 * the worker (RedisModule and ConfigModule are global). */
@Global()
@Module({
  providers: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    PublicStatusService,
  ],
  exports: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    PublicStatusService,
  ],
})
export class OpsModule {}

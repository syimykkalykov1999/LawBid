import { Global, Module } from '@nestjs/common';
import { AwsCapacityService } from './aws-capacity.service';
import {
  AwsBudgetsAdminService,
  AwsCostService,
  PagerDutySnsService,
} from './launch/aws-launch.service';
import { LaunchChecksService } from './launch/launch-checks.service';
import { SpendService } from './spend/spend.service';
import { AwsOpsService } from './aws-ops.service';
import { HttpStatsService } from './http-stats.service';
import { RealtimeStatsService } from './realtime-stats.service';
import { CronIdleBackoffService } from './cron-idle-backoff.service';
import { OpsStateService } from './ops-state.service';
import { IncidentsService } from './status/incidents.service';
import { StatusProbesService } from './status/status-probes.service';

/** Owner 2026-10-05: zero-maintenance operations, shared by the API and
 * the worker (RedisModule and ConfigModule are global). */
@Global()
@Module({
  providers: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    CronIdleBackoffService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    AwsBudgetsAdminService,
    AwsCostService,
    PagerDutySnsService,
    LaunchChecksService,
    SpendService,
  ],
  exports: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    CronIdleBackoffService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    AwsBudgetsAdminService,
    AwsCostService,
    PagerDutySnsService,
    LaunchChecksService,
    SpendService,
  ],
})
export class OpsModule {}

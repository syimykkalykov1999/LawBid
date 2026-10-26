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
import { OpsStateService } from './ops-state.service';
import { SecretRotationService } from './secret-rotation.service';
import { IncidentsService } from './status/incidents.service';
import { PublicStatusService } from './status/public-status.service';
import { StatusProbesService } from './status/status-probes.service';
import { SsmParamGateway } from './ssm-param.gateway';
import { UsageHardStopService } from './usage/usage-hard-stop.service';

/** Owner 2026-10-05: zero-maintenance operations, shared by the API and
 * the worker (RedisModule and ConfigModule are global). */
@Global()
@Module({
  providers: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    SecretRotationService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    AwsBudgetsAdminService,
    AwsCostService,
    PagerDutySnsService,
    LaunchChecksService,
    SpendService,
    PublicStatusService,
    UsageHardStopService,
    SsmParamGateway,
  ],
  exports: [
    AwsOpsService,
    AwsCapacityService,
    OpsStateService,
    SecretRotationService,
    HttpStatsService,
    RealtimeStatsService,
    StatusProbesService,
    IncidentsService,
    AwsBudgetsAdminService,
    AwsCostService,
    PagerDutySnsService,
    LaunchChecksService,
    SpendService,
    PublicStatusService,
    UsageHardStopService,
    SsmParamGateway,
  ],
})
export class OpsModule {}

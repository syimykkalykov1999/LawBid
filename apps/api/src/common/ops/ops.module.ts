import { Global, Module } from '@nestjs/common';
import { AwsCapacityService } from './aws-capacity.service';
import { AwsOpsService } from './aws-ops.service';
import { OpsStateService } from './ops-state.service';

/** Owner 2026-10-05: zero-maintenance operations, shared by the API and
 * the worker (RedisModule and ConfigModule are global). */
@Global()
@Module({
  providers: [AwsOpsService, AwsCapacityService, OpsStateService],
  exports: [AwsOpsService, AwsCapacityService, OpsStateService],
})
export class OpsModule {}

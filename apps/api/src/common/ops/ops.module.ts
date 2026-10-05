import { Global, Module } from '@nestjs/common';
import { AwsOpsService } from './aws-ops.service';
import { OpsStateService } from './ops-state.service';

/** Owner 2026-10-05: zero-maintenance operations, shared by the API and
 * the worker (RedisModule and ConfigModule are global). */
@Global()
@Module({
  providers: [AwsOpsService, OpsStateService],
  exports: [AwsOpsService, OpsStateService],
})
export class OpsModule {}

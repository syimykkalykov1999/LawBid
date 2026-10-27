import { Module } from '@nestjs/common';
import { RateLimitService } from '../../modules/auth/services/rate-limit.service';
import { StrikeGate } from './strike-gate.service';
import { UsageLimitsService } from './usage-limits.service';

/** docs/05 §13 limits. RateLimitService is a plain Redis helper (global
 * REDIS_CLIENT), provided here without importing the whole AuthModule.
 * StrikeGate (owner 2026-10-27) applies the strike ladder's limits. */
@Module({
  providers: [RateLimitService, StrikeGate, UsageLimitsService],
  exports: [UsageLimitsService, StrikeGate],
})
export class UsageLimitsModule {}

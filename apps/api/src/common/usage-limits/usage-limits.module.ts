import { Module } from '@nestjs/common';
import { RateLimitService } from '../../modules/auth/services/rate-limit.service';
import { UsageLimitsService } from './usage-limits.service';

/** docs/05 §13 limits. RateLimitService is a plain Redis helper (global
 * REDIS_CLIENT), provided here without importing the whole AuthModule. */
@Module({
  providers: [RateLimitService, UsageLimitsService],
  exports: [UsageLimitsService],
})
export class UsageLimitsModule {}

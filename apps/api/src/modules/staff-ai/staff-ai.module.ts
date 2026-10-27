import { Module } from '@nestjs/common';
import { StaffAiQaNightlyJob } from '../../jobs/handlers/staff-ai-qa-nightly.job';
import { StaffAiController } from './staff-ai.controller';

/**
 * Staff package (T12): AI mode (master switch staff.ai_enabled, off = zero AI calls).
 * Core part (providers, the cron jobs), imported by
 * StaffModule (API) and JobsModule (API + worker). T1 registered the
 * stubs; everything stays a no-op while its switch is off.
 */
@Module({
  providers: [StaffAiQaNightlyJob],
  exports: [StaffAiQaNightlyJob],
})
export class StaffAiCoreModule {}

/** Staff package (T12): the admin routes of staff-ai (API only). */
@Module({
  imports: [StaffAiCoreModule],
  controllers: [StaffAiController],
})
export class StaffAiModule {}

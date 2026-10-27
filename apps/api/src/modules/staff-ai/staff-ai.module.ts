import { Module } from '@nestjs/common';
import { StaffAiQaNightlyJob } from '../../jobs/handlers/staff-ai-qa-nightly.job';
import { StaffAiBudgetService } from './staff-ai-budget.service';
import { STAFF_AI_FETCH, StaffAiClient } from './staff-ai-client.service';
import { StaffAiContextService } from './staff-ai-context.service';
import { StaffAiHintService } from './staff-ai-hint.service';
import { StaffAiQaService } from './staff-ai-qa.service';
import { StaffAiSummaryService } from './staff-ai-summary.service';
import { StaffAiController } from './staff-ai.controller';

/**
 * Staff package (T12): AI mode (master switch staff.ai_enabled, off = zero AI calls).
 * Core part (providers, the cron job), imported by StaffModule (API) and
 * JobsModule (API + worker). Every provider is idle while its switch is off.
 */
@Module({
  providers: [
    // The one transport to the Claude API; e2e swaps it for a mock.
    {
      provide: STAFF_AI_FETCH,
      useValue: (url: string, init: RequestInit) => fetch(url, init),
    },
    StaffAiBudgetService,
    StaffAiClient,
    StaffAiContextService,
    StaffAiQaService,
    StaffAiHintService,
    StaffAiSummaryService,
    StaffAiQaNightlyJob,
  ],
  exports: [
    StaffAiClient,
    StaffAiBudgetService,
    StaffAiHintService,
    StaffAiSummaryService,
    StaffAiQaNightlyJob,
  ],
})
export class StaffAiCoreModule {}

/** Staff package (T12): the admin routes of staff-ai (API only). */
@Module({
  imports: [StaffAiCoreModule],
  controllers: [StaffAiController],
})
export class StaffAiModule {}

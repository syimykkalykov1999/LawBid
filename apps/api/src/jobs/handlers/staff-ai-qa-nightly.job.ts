import { Injectable, Logger } from '@nestjs/common';
import { StaffAiBudgetService } from '../../modules/staff-ai/staff-ai-budget.service';
import { StaffAiQaService } from '../../modules/staff-ai/staff-ai-qa.service';
import { StaffAiSummaryService } from '../../modules/staff-ai/staff-ai-summary.service';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.ai-qa-nightly` (0 4 * * * UTC, lane cron-heavy).
 * AI mode night shift, in this order:
 *  1. `staff.ai_qa_enabled`: collect yesterday's finished Batch, submit tonight's
 *     (the AI re-check of the previous day's decisions);
 *  2. `staff.ai_summary_enabled`: write the missing recommendation texts;
 *  3. copy the month's spend counter into the nightly snapshot.
 * Owner of this file: T12 (staff-ai). With the master switch `staff.ai_enabled`
 * off (the default), or both switches off, it returns at once — not one AI
 * call, not one query.
 */
@Injectable()
export class StaffAiQaNightlyJob {
  private readonly logger = new Logger(StaffAiQaNightlyJob.name);

  constructor(
    private readonly staff: StaffSettingsService,
    private readonly qa: StaffAiQaService,
    private readonly summary: StaffAiSummaryService,
    private readonly budget: StaffAiBudgetService,
  ) {}

  async run(): Promise<StaffJobResult> {
    const s = await this.staff.get();
    if (!s.switches['staff.ai_enabled']) return STAFF_JOB_OFF;
    const qaOn = s.switches['staff.ai_qa_enabled'];
    const summaryOn = s.switches['staff.ai_summary_enabled'];
    if (!qaOn && !summaryOn) return STAFF_JOB_OFF;

    const out: Record<string, number | string | boolean> = {};
    // One step failing must not stop the other or the snapshot.
    if (qaOn) {
      try {
        for (const [k, v] of Object.entries(await this.qa.runNightly()))
          out[`qa_${k}`] = v;
      } catch (e) {
        out.qa_error = e instanceof Error ? e.name : 'error';
        this.logger.warn(`staff AI QA step failed: ${String(e)}`);
      }
    }
    if (summaryOn) {
      try {
        for (const [k, v] of Object.entries(
          await this.summary.refreshNightly(),
        )) {
          out[`summary_${k}`] = v;
        }
      } catch (e) {
        out.summary_error = e instanceof Error ? e.name : 'error';
        this.logger.warn(`staff AI summary step failed: ${String(e)}`);
      }
    }
    const snap = await this.budget.writeSnapshot();
    out.spentMillicents = snap.millicents;
    return out;
  }
}

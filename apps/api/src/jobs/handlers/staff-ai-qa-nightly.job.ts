import { Injectable } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import {
  STAFF_JOB_OFF,
  STAFF_JOB_STUB,
  type StaffJobResult,
} from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.ai-qa-nightly` (0 4 * * * UTC, lane cron-heavy).
 * AI review of decisions (Batch API). staff.ai_qa_enabled counts only under the master staff.ai_enabled: off = not one AI call.
 * Owner of this file: T12 (staff-ai) (T1 only registered the stub). While
 * staff.ai_qa_enabled is off (the default) it returns at once without touching the database.
 */
@Injectable()
export class StaffAiQaNightlyJob {
  constructor(private readonly staff: StaffSettingsService) {}

  async run(): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.ai_qa_enabled'))) return STAFF_JOB_OFF;
    return STAFF_JOB_STUB;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { StaffSettingsService } from '../../modules/staff-core/staff-settings.service';
import { StaffDigestService } from '../../modules/staff-home/staff-digest.service';
import { digestText } from '../../modules/staff-home/staff-digest.logic';
import { PushQueueService } from '../../modules/notifications/push/push-queue.service';
import { STAFF_JOB_OFF, type StaffJobResult } from './staff-job-gate';

/**
 * Staff package (plan B5): cron job `staff.weekly-digest` (0 13 * * 1 UTC, lane cron).
 * The weekly «5 чисел» into staff_digests and to the owner (push + e-mail
 * through the on-call channel, like the status alerts). Owner of this file:
 * T10 (staff-home). While staff.weekly_digest_enabled is off (the default) it
 * returns at once without touching the database. One row a week: a repeat run
 * sends nothing.
 */
@Injectable()
export class StaffWeeklyDigestJob {
  private readonly logger = new Logger(StaffWeeklyDigestJob.name);

  constructor(
    private readonly staff: StaffSettingsService,
    private readonly digest: StaffDigestService,
    private readonly push: PushQueueService,
  ) {}

  async run(now = new Date()): Promise<StaffJobResult> {
    if (!(await this.staff.isOn('staff.weekly_digest_enabled')))
      return STAFF_JOB_OFF;
    const d = await this.digest.prepare(now);
    if (!d) return { result: 'already sent' };
    const { title, body } = digestText(d.week, d.numbers);
    let sent = 0;
    for (const o of await this.digest.recipients()) {
      try {
        await this.push.enqueueOpsAlert({
          recipientId: o.id,
          title,
          body,
          incidentId: `staff-digest-${d.week}`,
          event: 'digest',
          seq: 1,
          email: Boolean(o.email),
        });
        sent++;
      } catch (e) {
        this.logger.warn(`digest ${d.week}: enqueue failed: ${String(e)}`);
      }
    }
    return { week: d.week, sent };
  }
}

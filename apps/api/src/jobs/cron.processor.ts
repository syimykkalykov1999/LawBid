import { Injectable } from '@nestjs/common';
import { CRON_JOBS } from './jobs.constants';
import { SessionsCleanupJob } from './handlers/sessions-cleanup.job';
import { OtpCleanupJob } from './handlers/otp-cleanup.job';
import { DisposableDomainsRefreshJob } from './disposable-domains/disposable-domains-refresh.job';
import { ReviewReminderJob } from './handlers/review-reminder.job';
import { RatingReconcileJob } from './handlers/rating-reconcile.job';

/** Routes a `cron` queue job to its handler by job name. The return value
 * becomes the BullMQ job's `returnvalue` (visible in queue dashboards). */
@Injectable()
export class CronProcessor {
  constructor(
    private readonly sessionsCleanup: SessionsCleanupJob,
    private readonly otpCleanup: OtpCleanupJob,
    private readonly disposableRefresh: DisposableDomainsRefreshJob,
    private readonly reviewReminder: ReviewReminderJob,
    private readonly ratingReconcile: RatingReconcileJob,
  ) {}

  async process(name: string): Promise<unknown> {
    switch (name) {
      case CRON_JOBS.sessionsCleanup:
        return this.sessionsCleanup.run();
      case CRON_JOBS.otpCleanup:
        return this.otpCleanup.run();
      case CRON_JOBS.disposableDomainsRefresh:
        return this.disposableRefresh.run();
      case CRON_JOBS.reviewReminder:
        return this.reviewReminder.run();
      case CRON_JOBS.ratingReconcile:
        return this.ratingReconcile.run();
      default:
        // A job left over from an older/newer release: fail it visibly
        // rather than "succeed" doing nothing.
        throw new Error(`Unknown cron job: ${name}`);
    }
  }
}

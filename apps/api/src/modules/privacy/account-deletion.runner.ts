import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  AccountAnonymizationService,
  type AnonymizationResult,
} from './account-anonymization.service';
import {
  ACCOUNT_DELETION_JOB,
  ACCOUNT_DELETION_QUEUE,
  PRIVACY_OPTIONS,
  type PrivacyModuleOptions,
} from './privacy.constants';

interface DeletionJobData {
  userId: string;
}

/** Accounts looked up per page when scheduling. */
const PAGE = 500;

/** BullMQ job id of one account's anonymization on that UTC day: the same
 * day never queues it twice; the next day retries a failed one. */
export function deletionJobId(userId: string, now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `anonymize-${userId}-${day}`;
}

/**
 * Owner 2026-10-22 (audit #4 §5): account deletion is queued — the daily
 * `privacy.anonymize` cron only schedules one job per due account; the
 * worker runs AccountAnonymizationService.anonymize (idempotent: the
 * Stripe, S3 and Bunny steps tolerate a repeat, the DB part is one
 * transaction). Five attempts with exponential backoff; a job that still
 * fails stays in the failed set for the ops dashboard, and the next day's
 * tick queues it again. Without Redis (tests, local tools) it runs inline.
 */
@Injectable()
export class AccountDeletionRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<DeletionJobData>;
  private worker?: Worker<DeletionJobData>;

  constructor(
    @Inject(PRIVACY_OPTIONS) private readonly options: PrivacyModuleOptions,
    private readonly config: ConfigService,
    private readonly anonymization: AccountAnonymizationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AccountDeletionRunner.name);
  }

  get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.queue = new Queue<DeletionJobData>(ACCOUNT_DELETION_QUEUE, {
      connection: { url },
    });
    if (!this.workerEnabled) return;
    this.worker = new Worker<DeletionJobData>(
      ACCOUNT_DELETION_QUEUE,
      (job: Job<DeletionJobData>) =>
        this.anonymization.anonymize(job.data.userId),
      // Each job talks to Stripe, S3 and Bunny: a small concurrency keeps
      // their rate limits and the database calm.
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => {
      if (!job) return;
      this.logger.error(
        {
          userId: job.data.userId,
          attempt: job.attemptsMade,
          err: error.message,
        },
        'account anonymization failed',
      );
    });
  }

  /** The cron tick: queues every due account (or runs them inline). */
  async scheduleDue(
    now: Date = new Date(),
  ): Promise<{ queued: number } | AnonymizationResult> {
    if (!this.queue) return this.anonymization.anonymizeDue(now);
    let queued = 0;
    const seen: string[] = [];
    for (;;) {
      const ids = await this.anonymization.dueUserIds(now, seen, PAGE);
      if (ids.length === 0) break;
      await this.queue.addBulk(
        ids.map((userId) => ({
          name: ACCOUNT_DELETION_JOB,
          data: { userId },
          opts: {
            jobId: deletionJobId(userId, now),
            attempts: 5,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
          },
        })),
      );
      queued += ids.length;
      seen.push(...ids);
      if (ids.length < PAGE) break;
    }
    return { queued };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

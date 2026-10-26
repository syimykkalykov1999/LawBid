import {
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataExportJob } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { DataExportService } from './data-export.service';
import {
  DATA_EXPORT_JOB,
  DATA_EXPORT_QUEUE,
  DATA_EXPORT_STALE_PROCESSING_MS,
  PRIVACY_OPTIONS,
  type PrivacyModuleOptions,
} from './privacy.constants';
import type { DataExportJobDto } from './privacy.dto';
import { bullOptions } from '../../redis/redis-connection';
import {
  closeWorker,
  isStalledFailure,
  workerTuning,
} from '../../common/queues/queue-hardening';

interface ExportJobData {
  exportId: string;
}

/**
 * docs/06 §5.2: `POST /users/me/data-export` → `data_export_jobs`
 * (`type = user_data`) + one BullMQ job (jobId = row id: a retry never
 * builds two ZIPs); the worker (DataExportService.process) stores the ZIP
 * and notifies. One export in flight per user (the last queued/processing
 * row is returned instead of a new job).
 */
@Injectable()
export class DataExportRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(PRIVACY_OPTIONS) private readonly options: PrivacyModuleOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly exports: DataExportService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DataExportRunner.name);
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
    this.queue = new Queue(
      DATA_EXPORT_QUEUE,
      bullOptions(DATA_EXPORT_QUEUE, url),
    );
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      DATA_EXPORT_QUEUE,
      (job: Job<ExportJobData>) =>
        this.exports.process(job.data.exportId, {
          // BullMQ gave this job out before (a crash or a stall): resume it.
          retry: (job.attemptsStarted ?? 0) > 1 || job.attemptsMade > 0,
        }),
      {
        ...bullOptions(DATA_EXPORT_QUEUE, url, { worker: true }),
        ...workerTuning(DATA_EXPORT_QUEUE),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job: Job<ExportJobData> | undefined, error) => {
      if (!job) return;
      this.logger.error(
        { exportId: job.data.exportId, err: error.message },
        'data export failed',
      );
      // A job that stalled more often than allowed fails WITHOUT using up
      // its attempts (S10-3): the row must still leave `processing`.
      if (
        job.attemptsMade >= (job.opts.attempts ?? 1) ||
        isStalledFailure(error)
      ) {
        void this.prisma.dataExportJob
          .updateMany({
            where: {
              id: job.data.exportId,
              status: { in: ['queued', 'processing'] },
            },
            data: { status: 'failed', error: error.message.slice(0, 500) },
          })
          .catch(() => undefined);
      }
    });
  }

  async request(user: RequestUser): Promise<DataExportJobDto> {
    const inFlight = await this.prisma.dataExportJob.findFirst({
      where: {
        user_id: user.sub,
        type: 'user_data',
        // Security audit 2026-10-01: a ready export also counts — one
        // ZIP a day (it costs S3 + an email); the same job comes back.
        status: { in: ['queued', 'processing', 'ready'] },
        created_at: { gt: new Date(Date.now() - 24 * 3600 * 1000) },
      },
      orderBy: { created_at: 'desc' },
    });
    if (inFlight && (await this.stillAlive(inFlight))) {
      return this.status(user, inFlight.id);
    }
    const row = await this.prisma.dataExportJob.create({
      data: { user_id: user.sub, type: 'user_data', status: 'queued' },
    });
    try {
      await this.addJob(row.id);
    } catch (error) {
      // S10-4: the row must never outlive a failed enqueue — it used to sit
      // `queued` and lock the user out of their data for 24 hours.
      await this.prisma.dataExportJob
        .updateMany({
          where: { id: row.id, status: 'queued' },
          data: { status: 'failed', error: 'could not be queued' },
        })
        .catch(() => undefined);
      throw error;
    }
    return this.present(row, null);
  }

  private async addJob(exportId: string): Promise<void> {
    if (!this.queue) throw new Error('data export queue not started');
    await this.queue.add(
      DATA_EXPORT_JOB,
      { exportId },
      {
        jobId: exportId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
  }

  /**
   * Is the in-flight row really being worked on? `ready` yes. `queued`
   * without a BullMQ job (Redis lost it, or the enqueue failed after the
   * insert) is queued again under the same id (S10-4). `processing` with no
   * live job and untouched for a long time is dead: it is marked failed so
   * the user can ask again instead of waiting out the 24-hour window.
   */
  private async stillAlive(row: DataExportJob): Promise<boolean> {
    if (row.status === 'ready' || !this.queue) return true;
    let job: Job | undefined;
    try {
      job = await this.queue.getJob(row.id);
    } catch {
      return true; // Redis unreachable: do not make things worse
    }
    if (job) return true;
    if (row.status === 'queued') {
      try {
        await this.addJob(row.id);
        return true;
      } catch {
        return true; // the next request tries again
      }
    }
    if (
      Date.now() - row.updated_at.getTime() <
      DATA_EXPORT_STALE_PROCESSING_MS
    ) {
      return true;
    }
    await this.prisma.dataExportJob
      .updateMany({
        where: { id: row.id, status: 'processing' },
        data: { status: 'failed', error: 'worker lost' },
      })
      .catch(() => undefined);
    return false;
  }

  /** Status for the owner; a fresh signed link while the export is ready. */
  async status(user: RequestUser, exportId: string): Promise<DataExportJobDto> {
    const row = await this.prisma.dataExportJob.findFirst({
      where: { id: exportId, user_id: user.sub, type: 'user_data' },
      include: { file: { select: { s3_bucket: true, s3_key: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Export not found.',
      });
    }
    const now = Date.now();
    if (
      row.status === 'ready' &&
      row.expires_at &&
      row.expires_at.getTime() <= now
    ) {
      return this.present({ ...row, status: 'expired' }, null);
    }
    let url: string | null = null;
    if (row.status === 'ready' && row.file && row.expires_at) {
      url = await this.storage.signedGetUrl(
        row.file.s3_bucket,
        row.file.s3_key,
        Math.floor((row.expires_at.getTime() - now) / 1000),
      );
    }
    return this.present(row, url);
  }

  private present(row: DataExportJob, url: string | null): DataExportJobDto {
    return {
      exportId: row.id,
      status: row.status,
      url,
      expiresAt: row.expires_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }
}

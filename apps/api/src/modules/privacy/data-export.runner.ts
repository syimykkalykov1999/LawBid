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
  PRIVACY_OPTIONS,
  type PrivacyModuleOptions,
} from './privacy.constants';
import type { DataExportJobDto } from './privacy.dto';

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
    this.queue = new Queue(DATA_EXPORT_QUEUE, { connection: { url } });
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      DATA_EXPORT_QUEUE,
      (job: Job<ExportJobData>) => this.exports.process(job.data.exportId),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 2 },
    );
    this.worker.on('failed', (job: Job<ExportJobData> | undefined, error) => {
      if (!job) return;
      this.logger.error(
        { exportId: job.data.exportId, err: error.message },
        'data export failed',
      );
      if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.prisma.dataExportJob.updateMany({
          where: {
            id: job.data.exportId,
            status: { in: ['queued', 'processing'] },
          },
          data: { status: 'failed', error: error.message.slice(0, 500) },
        });
      }
    });
  }

  async request(user: RequestUser): Promise<DataExportJobDto> {
    const inFlight = await this.prisma.dataExportJob.findFirst({
      where: {
        user_id: user.sub,
        type: 'user_data',
        status: { in: ['queued', 'processing'] },
        created_at: { gt: new Date(Date.now() - 24 * 3600 * 1000) },
      },
      orderBy: { created_at: 'desc' },
    });
    if (inFlight) return this.present(inFlight, null);
    const row = await this.prisma.dataExportJob.create({
      data: { user_id: user.sub, type: 'user_data', status: 'queued' },
    });
    if (!this.queue) throw new Error('data export queue not started');
    await this.queue.add(
      DATA_EXPORT_JOB,
      { exportId: row.id },
      {
        jobId: row.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
    return this.present(row, null);
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
    await this.worker?.close();
    await this.queue?.close();
  }
}

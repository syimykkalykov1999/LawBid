import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';

/** BullMQ queue of the upload pipeline (docs/06 §6 `worker` service). */
export const FILES_QUEUE = 'files';
export const FILE_SCAN_JOB = 'files.scan';
export const FILES_JOBS_OPTIONS = Symbol('FILES_JOBS_OPTIONS');

export interface FilesJobsOptions {
  /** 'api': the worker runs only while JOBS_ENABLED (like the cron
   * queue); 'worker': always (src/worker.ts). The API always enqueues. */
  mode: 'api' | 'worker';
}

export const FILE_SCAN_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
} as const;

/** Owns the `files` queue: enqueue from the API, process in the worker. */
@Injectable()
export class FileScanRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(FILES_JOBS_OPTIONS) private readonly options: FilesJobsOptions,
    private readonly config: ConfigService,
    private readonly processor: FileScanProcessor,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileScanRunner.name);
  }

  get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.queue = new Queue(FILES_QUEUE, { connection: { url } });
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      FILES_QUEUE,
      (job: Job<{ fileId: string }>) =>
        this.processor.run(
          job.data.fileId,
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        ),
      {
        connection: { url, maxRetriesPerRequest: null },
        // Scans + sharp are CPU/memory heavy (10 MB files).
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { job: job?.name, attempts: job?.attemptsMade, err: error.message },
        'file scan job failed',
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'files worker error');
    });
  }

  /** One job per file (jobId = file id: a duplicate enqueue is a no-op). */
  async enqueueScan(fileId: string): Promise<void> {
    if (!this.queue) throw new Error('files queue not started');
    await this.queue.add(
      FILE_SCAN_JOB,
      { fileId },
      { ...FILE_SCAN_JOB_OPTS, jobId: fileId },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

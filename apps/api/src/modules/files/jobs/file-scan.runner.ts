import {
  Inject,
  Injectable,
  Optional,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { FileScanProcessor } from './file-scan.processor';
import { bullOptions } from '../../../redis/redis-connection';
import {
  closeWorker,
  fairPriority,
  workerTuning,
} from '../../../common/queues/queue-hardening';

/** BullMQ queue of the upload pipeline (docs/06 §6 `worker` service). */
export const FILES_QUEUE = 'files';
export const FILE_SCAN_JOB = 'files.scan';
export const FILES_JOBS_OPTIONS = Symbol('FILES_JOBS_OPTIONS');

export interface FilesJobsOptions {
  /** 'api': the worker runs only while JOBS_ENABLED (like the cron
   * queue); 'worker': always (src/worker.ts). The API always enqueues. */
  mode: 'api' | 'worker';
}

/** BullMQ priority of one scan (1 = first); see enqueueScan (S10-11). */
export const FILE_SCAN_BASE_PRIORITY = 5;
export const FILE_SCAN_FAIR_WINDOW_SEC = 600;

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
    // S10-11: per-owner counter for fair priority; none = no fairness.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
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
    this.queue = new Queue(FILES_QUEUE, bullOptions(FILES_QUEUE, url));
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      FILES_QUEUE,
      (job: Job<{ fileId: string }>) =>
        this.processor.run(
          job.data.fileId,
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        ),
      {
        ...bullOptions(FILES_QUEUE, url, { worker: true }),
        ...workerTuning(FILES_QUEUE),
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

  /**
   * One scan per file (jobId = file id).
   *
   * S10-12: BullMQ ignores `add` while a job with the same id still exists
   * in the completed/failed sets, which keep the last 500 / 1000 jobs — so a
   * RE-scan of an already scanned file (new ClamAV signatures, an admin
   * «rescan») was a silent no-op. A finished job is removed first; a job
   * still waiting/active/delayed already is the scan, nothing to add.
   *
   * S10-11: fairness without BullMQ Pro groups — the more files one owner
   * enqueued in the last 10 minutes, the lower the BullMQ priority of the
   * next one, so a user uploading 500 files queues behind everybody else
   * instead of in front of them. Nothing is rejected.
   */
  async enqueueScan(fileId: string, ownerId?: string): Promise<void> {
    if (!this.queue) throw new Error('files queue not started');
    const existing = await this.queue.getJob(fileId);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') return;
      await existing.remove();
    }
    await this.queue.add(
      FILE_SCAN_JOB,
      { fileId },
      {
        ...FILE_SCAN_JOB_OPTS,
        jobId: fileId,
        priority: await this.priorityFor(ownerId),
      },
    );
  }

  private async priorityFor(ownerId: string | undefined): Promise<number> {
    const redis = this.redis;
    if (!ownerId || !redis) return FILE_SCAN_BASE_PRIORITY;
    try {
      const key = `scan:fair:${ownerId}`;
      const recent = await redis.incr(key);
      if (recent === 1) await redis.expire(key, FILE_SCAN_FAIR_WINDOW_SEC);
      return fairPriority(recent, FILE_SCAN_BASE_PRIORITY);
    } catch {
      return FILE_SCAN_BASE_PRIORITY;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }
}

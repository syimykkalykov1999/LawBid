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
  MEDIA_MODERATION_OPTIONS,
  MEDIA_MODERATION_QUEUE,
  MEDIA_REHIDE_SWEEP_JOB,
  type MediaModerationModuleOptions,
} from './media-moderation.constants';
import type { MediaCheckJobData } from './media-moderation.queue';
import { MediaModerationService } from './media-moderation.service';
import { bullOptions } from '../../redis/redis-connection';
import { closeWorker, workerTuning } from '../../common/queues/queue-hardening';

/** Owner 2026-10-22: the consumer of the `media-moderation` queue (the
 * worker process; the API too while JOBS_ENABLED, like the other queues).
 * Concurrency 4: Rekognition answers in ~200 ms and its default quota is
 * far above what one worker sends. */
@Injectable()
export class MediaModerationRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<MediaCheckJobData>;
  private queue?: Queue<MediaCheckJobData>;

  constructor(
    @Inject(MEDIA_MODERATION_OPTIONS)
    private readonly options: MediaModerationModuleOptions,
    private readonly config: ConfigService,
    private readonly service: MediaModerationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MediaModerationRunner.name);
  }

  get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || !this.workerEnabled) return;
    this.worker = new Worker<MediaCheckJobData>(
      MEDIA_MODERATION_QUEUE,
      (job: Job<MediaCheckJobData>) => this.handle(job.data),
      {
        ...bullOptions(MEDIA_MODERATION_QUEUE, url, { worker: true }),
        ...workerTuning(MEDIA_MODERATION_QUEUE),
        concurrency: 4,
      },
    );
    // S10-6: the DB row (status hidden, not decided) is the truth; the
    // delayed rehide job is only a trigger. An hourly scheduler (one per id)
    // re-applies whatever a lost job would have.
    this.queue = new Queue<MediaCheckJobData>(
      MEDIA_MODERATION_QUEUE,
      bullOptions(MEDIA_MODERATION_QUEUE, url),
    );
    void this.queue
      .upsertJobScheduler(
        MEDIA_REHIDE_SWEEP_JOB,
        { every: 60 * 60_000 },
        {
          name: MEDIA_REHIDE_SWEEP_JOB,
          data: { kind: 'rehide_sweep' },
          opts: {
            removeOnComplete: { count: 24 },
            removeOnFail: { count: 50 },
          },
        },
      )
      .catch((error: unknown) =>
        this.logger.warn(
          { err: error instanceof Error ? error.message : String(error) },
          'media rehide sweep not scheduled',
        ),
      );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { job: job?.id, attempts: job?.attemptsMade, err: error.message },
        'media moderation job failed',
      );
    });
  }

  handle(data: MediaCheckJobData): Promise<unknown> {
    switch (data.kind) {
      case 'file':
        return this.service.checkFile(data.fileId);
      case 'video':
        return this.service.checkVideo(data.videoAssetId);
      case 'rehide':
        return this.service.rehide(data.checkId);
      case 'rehide_sweep':
        // CONTENT M-1: the same hourly tick re-runs budget/error checks.
        return this.service.rehideSweep().then(async (r) => ({
          ...r,
          ...(await this.service.recheckSweep()),
        }));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }
}

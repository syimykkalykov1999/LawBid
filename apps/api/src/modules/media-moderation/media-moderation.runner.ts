import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  MEDIA_MODERATION_OPTIONS,
  MEDIA_MODERATION_QUEUE,
  type MediaModerationModuleOptions,
} from './media-moderation.constants';
import type { MediaCheckJobData } from './media-moderation.queue';
import { MediaModerationService } from './media-moderation.service';
import { bullOptions } from '../../redis/redis-connection';

/** Owner 2026-10-22: the consumer of the `media-moderation` queue (the
 * worker process; the API too while JOBS_ENABLED, like the other queues).
 * Concurrency 4: Rekognition answers in ~200 ms and its default quota is
 * far above what one worker sends. */
@Injectable()
export class MediaModerationRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<MediaCheckJobData>;

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
        concurrency: 4,
      },
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
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

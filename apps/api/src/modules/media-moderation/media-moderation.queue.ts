import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  MEDIA_CHECK_JOB,
  MEDIA_MODERATION_QUEUE,
  MEDIA_REHIDE_JOB,
  REHIDE_DELAY_MS,
  isModeratedPurpose,
} from './media-moderation.constants';
import { bullOptions } from '../../redis/redis-connection';

export type MediaCheckJobData =
  | { kind: 'file'; fileId: string }
  | { kind: 'video'; videoAssetId: string }
  | { kind: 'rehide'; checkId: string };

const JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
} as const;

/**
 * Owner 2026-10-22: the producer side of the `media-moderation` queue —
 * the upload pipeline (FileScanRunner) and the video pipeline
 * (VideosService) only enqueue; the worker (MediaModerationRunner) calls
 * the paid provider. Never throws into the caller: a moderation hiccup
 * must not fail an upload (the check is logged and retried by the next
 * upload of the same picture or by an admin).
 */
@Injectable()
export class MediaModerationQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<MediaCheckJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MediaModerationQueue.name);
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.queue = new Queue<MediaCheckJobData>(
      MEDIA_MODERATION_QUEUE,
      bullOptions(MEDIA_MODERATION_QUEUE, url),
    );
  }

  /** A clean public file (post photo, avatar, review photo). */
  async enqueueFile(fileId: string, purpose: string): Promise<void> {
    if (!isModeratedPurpose(purpose)) return;
    await this.add(MEDIA_CHECK_JOB, { kind: 'file', fileId }, `file-${fileId}`);
  }

  /** A reel / story / channel video that became ready (its thumbnail). */
  async enqueueVideo(videoAssetId: string): Promise<void> {
    await this.add(
      MEDIA_CHECK_JOB,
      { kind: 'video', videoAssetId },
      `video-${videoAssetId}`,
    );
  }

  /** Applies a hidden verdict once more after [REHIDE_DELAY_MS]. */
  async enqueueRehide(checkId: string): Promise<void> {
    await this.add(
      MEDIA_REHIDE_JOB,
      { kind: 'rehide', checkId },
      `rehide-${checkId}`,
      REHIDE_DELAY_MS,
    );
  }

  private async add(
    name: string,
    data: MediaCheckJobData,
    jobId: string,
    delay?: number,
  ): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(name, data, {
        ...JOB_OPTS,
        jobId,
        ...(delay ? { delay } : {}),
      });
    } catch (err) {
      this.logger.error(
        { jobId, err: err instanceof Error ? err.message : String(err) },
        'media moderation enqueue failed',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}

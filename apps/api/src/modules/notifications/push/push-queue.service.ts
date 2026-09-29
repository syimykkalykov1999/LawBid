import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  NO_PUSH_TYPES,
  PUSH_JOB,
  PUSH_JOB_OPTS,
  PUSH_QUEUE,
  type PushJobData,
} from './push.constants';

/**
 * Producer side of the `push` queue (docs/04 stage 4.8 "постановка push в
 * очередь", docs/05 §9.3 step 4). Never fails the caller: a Redis outage
 * loses only the push, the notification row (the list, the badge) stays.
 */
@Injectable()
export class PushQueueService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<PushJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PushQueueService.name);
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (url) this.queue = new Queue(PUSH_QUEUE, { connection: { url } });
  }

  async enqueue(notificationId: string, type: NotificationType): Promise<void> {
    if (!this.queue || NO_PUSH_TYPES.has(type)) return;
    try {
      await this.queue.add(
        PUSH_JOB,
        { notificationId },
        { ...PUSH_JOB_OPTS, jobId: notificationId },
      );
    } catch (error) {
      this.logger.warn(
        { notificationId, err: error instanceof Error ? error.message : error },
        'push enqueue failed',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}

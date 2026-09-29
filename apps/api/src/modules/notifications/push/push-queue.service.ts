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

/** Chat messages are committed before they're queued: no delay. */
const MESSAGE_JOB_OPTS = { ...PUSH_JOB_OPTS, delay: 0 } as const;

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

  /** A stored notification. [seq] > 1 = an aggregated repeat: realtime
   * and badge only, the first row already pushed (§9.4). */
  async enqueue(
    notificationId: string,
    type: NotificationType,
    seq = 1,
  ): Promise<void> {
    if (!this.queue) return;
    const push = seq === 1 && !NO_PUSH_TYPES.has(type);
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'notification', notificationId, push },
        {
          ...PUSH_JOB_OPTS,
          jobId: seq === 1 ? notificationId : `${notificationId}-${seq}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        { notificationId, err: error instanceof Error ? error.message : error },
        'push enqueue failed',
      );
    }
  }

  /** §8.4: push for a chat message (the dispatcher checks mute,
   * presence, settings and quiet hours). */
  async enqueueMessage(data: {
    recipientId: string;
    conversationId: string;
    messageId: string;
  }): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'message', ...data },
        { ...MESSAGE_JOB_OPTS, jobId: `m-${data.messageId}` },
      );
    } catch (error) {
      this.logger.warn(
        { messageId: data.messageId, err: errMsg(error) },
        'push enqueue failed',
      );
    }
  }

  /** Re-queue after the recipient's quiet hours. */
  async defer(data: PushJobData, until: Date, jobId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      PUSH_JOB,
      { ...data, deferred: true },
      {
        ...PUSH_JOB_OPTS,
        delay: Math.max(0, until.getTime() - Date.now()),
        jobId: `${jobId}-q`,
      },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}

function errMsg(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

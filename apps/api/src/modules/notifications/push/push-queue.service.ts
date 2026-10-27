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
  GROUP_PUSH_BATCH,
  NO_PUSH_TYPES,
  PUSH_JOB,
  PUSH_JOB_OPTS,
  PUSH_PRIORITY,
  PUSH_QUEUE,
  type PushJobData,
} from './push.constants';
import { demoContext } from '../../../common/demo/demo-context';
import { bullOptions } from '../../../redis/redis-connection';

/** Chat messages are committed before they're queued: no delay. */
const MESSAGE_JOB_OPTS = {
  ...PUSH_JOB_OPTS,
  delay: 0,
  priority: PUSH_PRIORITY.message,
} as const;

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
    if (url) this.queue = new Queue(PUSH_QUEUE, bullOptions(PUSH_QUEUE, url));
  }

  /** A stored notification. [seq] > 1 = an aggregated repeat: realtime
   * and badge only, the first row already pushed (§9.4). */
  async enqueue(
    notificationId: string,
    type: NotificationType,
    seq = 1,
    userId?: string,
  ): Promise<void> {
    if (!this.queue || demoContext.isDemo()) return;
    const push = seq === 1 && !NO_PUSH_TYPES.has(type);
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'notification', notificationId, userId, push },
        {
          ...PUSH_JOB_OPTS,
          priority: PUSH_PRIORITY.notification,
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

  /**
   * Owner 2026-10-22 (server load audit, finding 7): many stored rows of
   * one type (a channel post's subscribers) — one round trip (addBulk),
   * jobId = row id as in [enqueue].
   */
  async enqueueMany(
    notificationIds: string[],
    type: NotificationType,
    userIds: string[] = [],
  ): Promise<void> {
    if (!this.queue || demoContext.isDemo() || notificationIds.length === 0) {
      return;
    }
    const push = !NO_PUSH_TYPES.has(type);
    try {
      await this.queue.addBulk(
        notificationIds.map((notificationId, i) => ({
          name: PUSH_JOB,
          data: {
            kind: 'notification' as const,
            notificationId,
            userId: userIds[i],
            push,
          },
          opts: {
            ...PUSH_JOB_OPTS,
            priority: PUSH_PRIORITY.bulk,
            jobId: notificationId,
          },
        })),
      );
    } catch (error) {
      this.logger.warn(
        { count: notificationIds.length, err: errMsg(error) },
        'push enqueue failed',
      );
    }
  }

  /**
   * Owner 2026-10-22 (finding 7): a group message's pushes — one job per
   * GROUP_PUSH_BATCH members, all queued in one round trip. The job id per
   * message and batch makes a retried fan-out queue nothing twice.
   */
  async enqueueGroupMessages(data: {
    groupId: string;
    messageId: string;
    recipientIds: string[];
  }): Promise<void> {
    if (demoContext.isDemo() || !this.queue) return;
    const jobs = [];
    for (let i = 0; i < data.recipientIds.length; i += GROUP_PUSH_BATCH) {
      jobs.push({
        name: PUSH_JOB,
        data: {
          kind: 'group_messages' as const,
          groupId: data.groupId,
          messageId: data.messageId,
          recipientIds: data.recipientIds.slice(i, i + GROUP_PUSH_BATCH),
        },
        opts: {
          ...MESSAGE_JOB_OPTS,
          priority: PUSH_PRIORITY.group,
          jobId: `gm-${data.messageId}-${i / GROUP_PUSH_BATCH}`,
        },
      });
    }
    if (jobs.length === 0) return;
    try {
      await this.queue.addBulk(jobs);
    } catch (error) {
      this.logger.warn(
        { messageId: data.messageId, err: errMsg(error) },
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
    groupId?: string;
    event?: 'reaction' | 'edit';
    actorId?: string;
    emoji?: string;
  }): Promise<void> {
    if (demoContext.isDemo()) return;
    if (!this.queue) return;
    try {
      // A reaction pushes once per person, emoji and message; an edit once
      // per message — toggling or editing again never re-alerts.
      const jobId =
        data.event === 'reaction'
          ? `r-${data.messageId}-${data.actorId}-${data.emoji}`
          : data.event === 'edit'
            ? `e-${data.messageId}`
            : `m-${data.messageId}`;
      await this.queue.add(
        PUSH_JOB,
        { kind: 'message', ...data },
        { ...MESSAGE_JOB_OPTS, jobId },
      );
    } catch (error) {
      this.logger.warn(
        { messageId: data.messageId, err: errMsg(error) },
        'push enqueue failed',
      );
    }
  }

  /** OQ-041: ring now (no delay, one quick retry; a late ring is
   * useless — the dispatcher drops it once the call stopped ringing). */
  async enqueueCall(data: { recipientId: string; callId: string }) {
    if (demoContext.isDemo()) return;
    if (!this.queue) return;
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'call', ...data },
        {
          priority: PUSH_PRIORITY.urgent,
          attempts: 2,
          backoff: { type: 'fixed', delay: 1_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
          // OQ-048: one ring per recipient (the attorney and assistants).
          jobId: `c-${data.callId}-${data.recipientId}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        { callId: data.callId, err: errMsg(error) },
        'push enqueue failed',
      );
    }
  }

  /** Push 2026-10-19: stop the ringing on [recipientId]'s devices. */
  async enqueueCallEnded(data: {
    recipientId: string;
    callId: string;
    ended?: boolean;
  }) {
    if (demoContext.isDemo()) return;
    if (!this.queue) return;
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'call_end', ...data },
        {
          priority: PUSH_PRIORITY.urgent,
          attempts: 2,
          backoff: { type: 'fixed', delay: 1_000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
          jobId: `ce-${data.callId}-${data.recipientId}${data.ended ? '-end' : ''}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        { callId: data.callId, err: errMsg(error) },
        'push enqueue failed',
      );
    }
  }

  /** Re-queue after the recipient's quiet hours. */
  /** Owner 2026-10-22: one on-call alert (push, optionally e-mail). The job
   * id carries the incident, the event and its number, so a retried watchdog
   * never alerts twice. */
  async enqueueOpsAlert(data: {
    recipientId: string;
    title: string;
    body: string;
    incidentId: string;
    event: string;
    seq: number;
    email?: boolean;
  }): Promise<void> {
    if (!this.queue) return;
    const { seq, ...job } = data;
    try {
      await this.queue.add(
        PUSH_JOB,
        { kind: 'ops_alert', ...job },
        {
          ...PUSH_JOB_OPTS,
          delay: 0,
          priority: PUSH_PRIORITY.urgent,
          jobId: `ops-${data.incidentId}-${data.event}-${seq}-${data.recipientId}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        {
          incidentId: data.incidentId,
          err: error instanceof Error ? error.message : error,
        },
        'ops alert enqueue failed',
      );
    }
  }

  async defer(data: PushJobData, until: Date, jobId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      PUSH_JOB,
      { ...data, deferred: true },
      {
        ...PUSH_JOB_OPTS,
        priority: PUSH_PRIORITY.notification,
        delay: Math.max(0, until.getTime() - Date.now()),
        jobId: `${jobId}-q`,
      },
    );
  }

  /** S10-5: FCM said «too many requests» — the whole push queue (every
   * worker) takes no job for [ms] (BullMQ queue-wide rate limit). */
  async pauseFor(ms: number): Promise<void> {
    await this.queue?.rateLimit(ms);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}

function errMsg(error: unknown): unknown {
  return error instanceof Error ? error.message : error;
}

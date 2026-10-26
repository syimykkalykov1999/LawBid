import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import { shardCarry, shardContext } from '../../sharding/shard-context';
import { PrismaService } from '../../prisma/prisma.service';
import { BlocksService } from '../blocks/blocks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { bullOptions } from '../../redis/redis-connection';
import { closeWorker, workerTuning } from '../../common/queues/queue-hardening';

export const CHANNEL_FANOUT_QUEUE = 'channel-fanout';
export const CHANNEL_FANOUT_OPTIONS = Symbol('CHANNEL_FANOUT_OPTIONS');
/** Subscribers per job: one INSERT of rows and one bulk push enqueue. */
export const CHANNEL_FANOUT_BATCH = 500;
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} as const;

export interface ChannelFanoutOptions {
  mode: 'api' | 'worker';
}

export interface ChannelFanoutJob {
  channelId: string;
  channelTitle: string;
  channelUsername: string;
  postId: string;
  authorId: string;
  /** Last subscriber id of the previous batch (null: start). */
  after: string | null;
  /** The demo world (src/common/demo): the job reads the demo database. */
  demo?: boolean;
  /** Shard context of the enqueuer (shard-ready step 4), `shard:N`. */
  shardKey?: string;
}

/**
 * Owner 2026-10-22 (server load audit, finding 7): a channel post used to
 * notify its subscribers from the API process that took the request — a
 * row and a push job per subscriber, one after another. Now the request
 * queues the first batch (BullMQ `channel-fanout`, jobId per post and
 * cursor, so a retry repeats nothing); each batch writes the rows of 500
 * subscribers in one INSERT (NotificationsService.emitMany, deduplicated
 * per post) and queues their pushes in one round trip, then queues the next
 * batch. Processed in the API while JOBS_ENABLED and always in the worker.
 * Without Redis (tests) the batches run inline.
 */
@Injectable()
export class ChannelFanoutRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<ChannelFanoutJob>;
  private worker?: Worker<ChannelFanoutJob>;

  constructor(
    @Inject(CHANNEL_FANOUT_OPTIONS)
    private readonly options: ChannelFanoutOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
    // Owner 2026-10-22 (client economy plan, package F): one light
    // `channel:update` per batch of subscribers (no body) — their list row
    // moves without a GET.
    @Optional() private readonly realtime?: RealtimePublisher,
  ) {
    this.logger.setContext(ChannelFanoutRunner.name);
  }

  private get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.queue = new Queue(
      CHANNEL_FANOUT_QUEUE,
      bullOptions(CHANNEL_FANOUT_QUEUE, url),
    );
    if (!this.workerEnabled) return;
    // Batches of different posts (and of one post) are independent: the
    // bell list sorts by time, pushes carry their own post.
    this.worker = new Worker<ChannelFanoutJob>(
      CHANNEL_FANOUT_QUEUE,
      (job: Job<ChannelFanoutJob>) => this.process(job.data),
      {
        ...bullOptions(CHANNEL_FANOUT_QUEUE, url, { worker: true }),
        ...workerTuning(CHANNEL_FANOUT_QUEUE),
        concurrency: 4,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { postId: job?.data.postId, err: error.message },
        'channel fan-out batch failed',
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }

  /** Queues the first batch (or runs every batch inline without Redis). */
  async start(job: Omit<ChannelFanoutJob, 'after' | 'demo'>): Promise<void> {
    const first: ChannelFanoutJob = {
      ...job,
      after: null,
      ...(demoContext.isDemo() ? { demo: true } : {}),
      ...shardCarry(),
    };
    if (!this.queue) {
      let after: string | null = null;
      do {
        after = await this.emitBatch({ ...first, after });
      } while (after);
      return;
    }
    await this.queue.add('batch', first, {
      ...JOB_OPTS,
      jobId: `${job.postId}-start`,
    });
  }

  async process(data: ChannelFanoutJob): Promise<void> {
    await demoContext.run(data.demo === true, () =>
      shardContext.runFromKey(data.shardKey, () => this.processBatch(data)),
    );
  }

  private async processBatch(data: ChannelFanoutJob): Promise<void> {
    const next = await this.emitBatch(data);
    if (next && this.queue) {
      await this.queue.add(
        'batch',
        { ...data, after: next },
        { ...JOB_OPTS, jobId: `${data.postId}-${next}` },
      );
    }
  }

  /** Notifies one batch of subscribers who have not muted the channel
   * (nobody the author blocked or is blocked by, never the author);
   * returns the cursor of the next batch, or null. */
  async emitBatch(data: ChannelFanoutJob): Promise<string | null> {
    const hidden = await this.blocks.hiddenIds(data.authorId);
    const subs = await this.prisma.channelSubscription.findMany({
      where: {
        channel_id: data.channelId,
        muted: false,
        OR: [{ muted_until: null }, { muted_until: { lte: new Date() } }],
        user_id: { notIn: [...hidden, data.authorId] },
      },
      orderBy: { user_id: 'asc' },
      take: CHANNEL_FANOUT_BATCH,
      ...(data.after
        ? {
            cursor: {
              channel_id_user_id: {
                channel_id: data.channelId,
                user_id: data.after,
              },
            },
            skip: 1,
          }
        : {}),
      select: { user_id: true },
    });
    if (subs.length === 0) return null;
    this.realtime?.toUsers(
      subs.map((s) => s.user_id),
      'channel:update',
      {
        channelId: data.channelId,
        postId: data.postId,
        lastPostAt: new Date().toISOString(),
      },
    );
    await this.notifications.emitMany({
      type: 'channel_post',
      recipientIds: subs.map((s) => s.user_id),
      payload: {
        channelId: data.channelId,
        channelTitle: data.channelTitle,
        channelUsername: data.channelUsername,
        postId: data.postId,
      },
      // One row per subscriber and post, however often a batch is retried.
      dedupeKey: `channel_post:${data.postId}`,
    });
    return subs.length === CHANNEL_FANOUT_BATCH
      ? subs[subs.length - 1].user_id
      : null;
  }
}

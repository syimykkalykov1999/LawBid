import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { hashShard } from '../../sharding/shard-id';
import { shardContext } from '../../sharding/shard-context';
import { NotificationsService } from '../notifications/notifications.service';
import {
  broadcastAudienceWhere,
  type BroadcastAudience,
} from './broadcast-audience';
import { bullOptions } from '../../redis/redis-connection';
import {
  closeWorker,
  workerTuning,
  outageProof,
} from '../../common/queues/queue-hardening';
import {
  queueConcurrency,
  trackConcurrency,
} from '../../common/queues/queue-concurrency';

export const BROADCAST_QUEUE = 'admin-broadcast';
export const BROADCAST_OPTIONS = Symbol('BROADCAST_OPTIONS');
/** Users per job; each job queues the next one (keyset on users.id). */
export const BROADCAST_BATCH = 500;
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
} as const;

export interface BroadcastFanoutOptions {
  mode: 'api' | 'worker';
}

export interface BroadcastJob {
  broadcastId: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  stateCode: string | null;
  /** Owner 2026-10-04: the chosen states; jobs queued before it carry
   * only `stateCode`. */
  stateCodes?: string[];
  /** Last user id of the previous batch (null: start). */
  after: string | null;
}

/**
 * Audit 2026-10-02: a broadcast used to emit to every recipient inside the
 * admin's HTTP request. Now the request stores the broadcast and queues
 * the first batch (BullMQ `admin-broadcast`); every batch emits to 500
 * users through NotificationsService.emit() and queues the next one.
 * Processed in the API while JOBS_ENABLED and always in the worker
 * process. Without Redis (tests) the batches run inline.
 */
@Injectable()
export class BroadcastFanoutRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<BroadcastJob>;
  private worker?: Worker<BroadcastJob>;

  constructor(
    @Inject(BROADCAST_OPTIONS) private readonly options: BroadcastFanoutOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BroadcastFanoutRunner.name);
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
    this.queue = new Queue(BROADCAST_QUEUE, bullOptions(BROADCAST_QUEUE, url));
    if (!this.workerEnabled) return;
    this.worker = new Worker<BroadcastJob>(
      BROADCAST_QUEUE,
      outageProof((job: Job<BroadcastJob>) => this.process(job.data)),
      {
        ...bullOptions(BROADCAST_QUEUE, url, { worker: true }),
        ...workerTuning(BROADCAST_QUEUE),
        concurrency: queueConcurrency(BROADCAST_QUEUE),
      },
    );
    trackConcurrency(this.worker);
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { broadcastId: job?.data.broadcastId, err: error.message },
        'broadcast batch failed',
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }

  /** Queues the first batch (or runs everything inline without Redis). */
  async start(job: Omit<BroadcastJob, 'after'>): Promise<void> {
    const first: BroadcastJob = { ...job, after: null };
    if (!this.queue) {
      let after: string | null = null;
      do {
        after = await this.emitBatch({ ...first, after });
      } while (after);
      return;
    }
    await this.queue.add('batch', first, {
      ...JOB_OPTS,
      jobId: `${job.broadcastId}-start`,
    });
  }

  private async process(data: BroadcastJob): Promise<void> {
    const next = await this.emitBatch(data);
    if (next && this.queue) {
      await this.queue.add(
        'batch',
        { ...data, after: next },
        { ...JOB_OPTS, jobId: `${data.broadcastId}-${next}` },
      );
    }
  }

  /** Emits to one batch; returns the cursor of the next one, or null. */
  async emitBatch(data: BroadcastJob): Promise<string | null> {
    const batch = await this.prisma.user.findMany({
      where: {
        ...broadcastAudienceWhere(
          data.audience,
          data.stateCodes ?? data.stateCode,
        ),
        ...(data.after ? { id: { gt: data.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BROADCAST_BATCH,
      select: { id: true },
    });
    // Pack C (round 2 #9): one row per person and broadcast, however often
    // a batch is retried (attempts: 3, a deploy restart) — the same
    // idempotency key as the channel fan-out (channel-fanout.runner.ts).
    // Grouped by the recipient's shard: a notification lives in its
    // recipient's database (one database: one group, as before).
    const byShard = new Map<number, string[]>();
    for (const u of batch) {
      const shard = hashShard(u.id);
      byShard.set(shard, [...(byShard.get(shard) ?? []), u.id]);
    }
    for (const ids of byShard.values()) {
      await shardContext.runForUser(ids[0], () =>
        this.notifications.emitMany({
          type: 'admin_broadcast',
          recipientIds: ids,
          payload: {
            title: data.title,
            body: data.body,
            broadcastId: data.broadcastId,
          },
          dedupeKey: `admin_broadcast:${data.broadcastId}`,
        }),
      );
    }
    return batch.length === BROADCAST_BATCH ? batch[batch.length - 1].id : null;
  }
}

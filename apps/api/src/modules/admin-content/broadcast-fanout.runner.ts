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
import { NotificationsService } from '../notifications/notifications.service';
import {
  broadcastAudienceWhere,
  type BroadcastAudience,
} from './broadcast-audience';

export const BROADCAST_QUEUE = 'admin-broadcast';
export const BROADCAST_OPTIONS = Symbol('BROADCAST_OPTIONS');
/** Users per job; each job queues the next one (keyset on users.id). */
export const BROADCAST_BATCH = 500;
/** Parallel emits inside a batch (each is one row + one push job). */
const EMIT_CONCURRENCY = 20;
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
    this.queue = new Queue(BROADCAST_QUEUE, { connection: { url } });
    if (!this.workerEnabled) return;
    this.worker = new Worker<BroadcastJob>(
      BROADCAST_QUEUE,
      (job: Job<BroadcastJob>) => this.process(job.data),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { broadcastId: job?.data.broadcastId, err: error.message },
        'broadcast batch failed',
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
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
        ...broadcastAudienceWhere(data.audience, data.stateCode),
        ...(data.after ? { id: { gt: data.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: BROADCAST_BATCH,
      select: { id: true },
    });
    for (let i = 0; i < batch.length; i += EMIT_CONCURRENCY) {
      await Promise.all(
        batch.slice(i, i + EMIT_CONCURRENCY).map((u) =>
          this.notifications.emit({
            type: 'admin_broadcast',
            recipientId: u.id,
            payload: {
              title: data.title,
              body: data.body,
              broadcastId: data.broadcastId,
            },
          }),
        ),
      );
    }
    return batch.length === BROADCAST_BATCH ? batch[batch.length - 1].id : null;
  }
}

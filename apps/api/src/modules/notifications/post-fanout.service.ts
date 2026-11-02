import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { demoContext } from '../../common/demo/demo-context';
import { bullOptions } from '../../redis/redis-connection';
import { shardCarry } from '../../sharding/shard-context';
import {
  ALERT_FANOUT_MAX,
  SubscriptionAlertsService,
} from './subscription-alerts.service';

export const POST_FANOUT_QUEUE = 'post-fanout';
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} as const;

export interface PostFanoutJob {
  authorId: string;
  postId: string;
  brief: boolean;
  /** Last follower id of the previous batch (null: start). */
  after: string | null;
  /** Alerts written by the earlier batches (the per-post cap). */
  done: number;
  demo?: boolean;
  /** Shard context of the enqueuer, `shard:N`. */
  shardKey?: string;
}

/**
 * Audit A-1 (2026-11-01): a new post used to alert its followers from the
 * API process that took the request — lost on a restart, nothing retried.
 * Now the request queues the first batch (BullMQ `post-fanout`, jobId per
 * post and cursor, so a retry repeats nothing); every batch writes 500
 * followers through SubscriptionAlertsService.alertBatch (deduplicated per
 * post) and queues the next one. Same shape as channel-fanout. Without
 * Redis (tests, dev) the batches run inline.
 */
@Injectable()
export class PostFanoutService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue<PostFanoutJob>;

  constructor(
    private readonly config: ConfigService,
    private readonly alerts: SubscriptionAlertsService,
  ) {}

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.queue = new Queue(
        POST_FANOUT_QUEUE,
        bullOptions(POST_FANOUT_QUEUE, url),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  /** Queues the first batch, or runs every batch right here without Redis.
   * Returns the alerts written here (0 when queued). */
  async start(
    authorId: string,
    postId: string,
    brief = false,
  ): Promise<number> {
    if (!this.queue)
      return this.alerts.followersOfPost(authorId, postId, brief);
    const first: PostFanoutJob = {
      authorId,
      postId,
      brief,
      after: null,
      done: 0,
      ...(demoContext.isDemo() ? { demo: true } : {}),
      ...shardCarry(),
    };
    await this.queue.add('batch', first, {
      ...JOB_OPTS,
      jobId: `${postId}-start`,
    });
    return 0;
  }

  /** One batch; queues the next while followers remain and the cap holds. */
  async runBatch(data: PostFanoutJob): Promise<number> {
    const r = await this.alerts.alertBatch(
      data.authorId,
      data.postId,
      data.brief,
      data.after,
    );
    const done = data.done + r.sent;
    if (r.next && done < ALERT_FANOUT_MAX && this.queue) {
      await this.queue.add(
        'batch',
        { ...data, after: r.next, done },
        { ...JOB_OPTS, jobId: `${data.postId}-${r.next}` },
      );
    }
    return r.sent;
  }
}

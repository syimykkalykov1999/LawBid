import {
  type DynamicModule,
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import {
  closeWorker,
  workerTuning,
  outageProof,
} from '../../common/queues/queue-hardening';
import { bullOptions } from '../../redis/redis-connection';
import { shardContext } from '../../sharding/shard-context';
import { FeedTimelineModule } from '../feed/feed-timeline.module';
import {
  FeedTimelineService,
  TIMELINE_JOB,
  type TimelineFanoutJob,
} from '../feed/feed-timeline.service';
import { NotificationsModule } from './notifications.module';
import {
  POST_FANOUT_QUEUE,
  PostFanoutService,
  type PostFanoutJob,
} from './post-fanout.service';
import {
  queueConcurrency,
  trackConcurrency,
} from '../../common/queues/queue-concurrency';

export const POST_FANOUT_OPTIONS = Symbol('POST_FANOUT_OPTIONS');

export interface PostFanoutOptions {
  mode: 'api' | 'worker';
}

/** Consumer of `post-fanout`: in the API while JOBS_ENABLED, always in the
 * worker process. */
@Injectable()
export class PostFanoutWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<PostFanoutJob | TimelineFanoutJob>;

  constructor(
    @Inject(POST_FANOUT_OPTIONS) private readonly options: PostFanoutOptions,
    private readonly config: ConfigService,
    private readonly fanout: PostFanoutService,
    private readonly logger: PinoLogger,
    // Item 23 (F1): job `timeline` of the same queue writes a new post into
    // the followers' precomputed feeds.
    private readonly timeline: FeedTimelineService,
  ) {
    this.logger.setContext(PostFanoutWorker.name);
  }

  private get enabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || !this.enabled) return;
    this.worker = new Worker<PostFanoutJob | TimelineFanoutJob>(
      POST_FANOUT_QUEUE,
      outageProof((job: Job<PostFanoutJob | TimelineFanoutJob>) =>
        job.name === TIMELINE_JOB
          ? this.processTimeline(job.data as TimelineFanoutJob)
          : this.process(job.data as PostFanoutJob),
      ),
      {
        ...bullOptions(POST_FANOUT_QUEUE, url, { worker: true }),
        ...workerTuning(POST_FANOUT_QUEUE),
        concurrency: queueConcurrency(POST_FANOUT_QUEUE),
      },
    );
    trackConcurrency(this.worker);
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { postId: job?.data.postId, err: error.message },
        'post fan-out batch failed',
      );
    });
  }

  process(data: PostFanoutJob): Promise<number> {
    return demoContext.run(data.demo === true, () =>
      shardContext.runFromKey(data.shardKey, () => this.fanout.runBatch(data)),
    );
  }

  async processTimeline(data: TimelineFanoutJob): Promise<number> {
    await demoContext.run(data.demo === true, () =>
      shardContext.runFromKey(data.shardKey, () =>
        this.timeline.runBatch(data),
      ),
    );
    return 0;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
  }
}

@Module({})
export class PostFanoutModule {
  static register(options: PostFanoutOptions): DynamicModule {
    return {
      module: PostFanoutModule,
      imports: [NotificationsModule, FeedTimelineModule],
      providers: [
        { provide: POST_FANOUT_OPTIONS, useValue: options },
        PostFanoutWorker,
      ],
    };
  }
}

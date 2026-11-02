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
import { closeWorker, workerTuning } from '../../common/queues/queue-hardening';
import { bullOptions } from '../../redis/redis-connection';
import { shardContext } from '../../sharding/shard-context';
import { NotificationsModule } from './notifications.module';
import {
  POST_FANOUT_QUEUE,
  PostFanoutService,
  type PostFanoutJob,
} from './post-fanout.service';

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
  private worker?: Worker<PostFanoutJob>;

  constructor(
    @Inject(POST_FANOUT_OPTIONS) private readonly options: PostFanoutOptions,
    private readonly config: ConfigService,
    private readonly fanout: PostFanoutService,
    private readonly logger: PinoLogger,
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
    this.worker = new Worker<PostFanoutJob>(
      POST_FANOUT_QUEUE,
      (job: Job<PostFanoutJob>) => this.process(job.data),
      {
        ...bullOptions(POST_FANOUT_QUEUE, url, { worker: true }),
        ...workerTuning(POST_FANOUT_QUEUE),
        concurrency: 4,
      },
    );
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

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
  }
}

@Module({})
export class PostFanoutModule {
  static register(options: PostFanoutOptions): DynamicModule {
    return {
      module: PostFanoutModule,
      imports: [NotificationsModule],
      providers: [
        { provide: POST_FANOUT_OPTIONS, useValue: options },
        PostFanoutWorker,
      ],
    };
  }
}

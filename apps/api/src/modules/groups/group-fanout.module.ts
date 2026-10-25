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
import { shardContext } from '../../sharding/shard-context';
import {
  GROUP_FANOUT_PARTITIONS,
  fanoutQueueName,
  type GroupFanoutJob,
} from './group-fanout.queue';
import { GroupsModule } from './groups.module';
import { GroupsService } from './groups.service';

export const GROUP_FANOUT_OPTIONS = Symbol('GROUP_FANOUT_OPTIONS');

export interface GroupFanoutOptions {
  mode: 'api' | 'worker';
}

/**
 * Owner 2026-10-22 (server load audit, finding 7): consumer of the
 * `group-fanout-<n>` queues (GroupFanoutQueue) — in the API while
 * JOBS_ENABLED, always in the worker process, like the other queues. One
 * job at a time per partition (global concurrency 1 on the queue), so a
 * group's events keep their order.
 */
@Injectable()
export class GroupFanoutWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private workers: Worker<GroupFanoutJob>[] = [];

  constructor(
    @Inject(GROUP_FANOUT_OPTIONS) private readonly options: GroupFanoutOptions,
    private readonly config: ConfigService,
    private readonly groups: GroupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GroupFanoutWorker.name);
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
    for (let i = 0; i < GROUP_FANOUT_PARTITIONS; i++) {
      const worker = new Worker<GroupFanoutJob>(
        fanoutQueueName(i),
        (job: Job<GroupFanoutJob>) => this.process(job.data),
        { connection: { url, maxRetriesPerRequest: null }, concurrency: 1 },
      );
      worker.on('failed', (job, error) => {
        this.logger.error(
          {
            groupId: job?.data.groupId,
            messageId: job?.data.messageId,
            err: error.message,
          },
          'group fan-out failed',
        );
      });
      this.workers.push(worker);
    }
  }

  /** One job, in the demo world when it came from there. */
  process(data: GroupFanoutJob): Promise<void> {
    return demoContext.run(data.demo === true, () =>
      shardContext.runFromKey(data.shardKey, () =>
        this.groups.deliverFanOut(data),
      ),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}

/** `api` mode consumes while JOBS_ENABLED, `worker` mode always. */
@Module({})
export class GroupFanoutModule {
  static register(options: GroupFanoutOptions): DynamicModule {
    return {
      module: GroupFanoutModule,
      imports: [GroupsModule],
      providers: [
        { provide: GROUP_FANOUT_OPTIONS, useValue: options },
        GroupFanoutWorker,
      ],
    };
  }
}

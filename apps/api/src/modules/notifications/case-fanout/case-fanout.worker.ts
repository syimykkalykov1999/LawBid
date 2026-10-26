import { bullOptions } from '../../../redis/redis-connection';
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
import { demoContext } from '../../../common/demo/demo-context';
import { shardContext } from '../../../sharding/shard-context';
import { NotificationsModule } from '../notifications.module';
import {
  CASE_FANOUT_QUEUE,
  CaseFanoutService,
  type CaseFanoutJob,
  type WaveOutcome,
} from './case-fanout.service';
import {
  closeWorker,
  workerTuning,
} from '../../../common/queues/queue-hardening';

export const CASE_FANOUT_OPTIONS = Symbol('CASE_FANOUT_OPTIONS');

export interface CaseFanoutOptions {
  mode: 'api' | 'worker';
}

/**
 * Consumer of the `case-fanout` queue: in the API while JOBS_ENABLED, in
 * the worker process always (like the other queues). Waves of different
 * cases run in parallel; a case's waves are separate delayed jobs.
 */
@Injectable()
export class CaseFanoutWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<CaseFanoutJob>;

  constructor(
    @Inject(CASE_FANOUT_OPTIONS) private readonly options: CaseFanoutOptions,
    private readonly config: ConfigService,
    private readonly fanout: CaseFanoutService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CaseFanoutWorker.name);
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
    this.worker = new Worker<CaseFanoutJob>(
      CASE_FANOUT_QUEUE,
      (job: Job<CaseFanoutJob>) => this.process(job.data),
      {
        ...bullOptions(CASE_FANOUT_QUEUE, url, { worker: true }),
        ...workerTuning(CASE_FANOUT_QUEUE),
        concurrency: 4,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { caseId: job?.data.caseId, wave: job?.data.wave, err: error.message },
        'case fan-out wave failed',
      );
    });
  }

  /** One wave, in the demo world / shard of the case when it came from
   * there. */
  process(data: CaseFanoutJob): Promise<WaveOutcome> {
    return demoContext.run(data.demo === true, () =>
      shardContext.runFromKey(data.shardKey, () => this.fanout.runWave(data)),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
  }
}

@Module({})
export class CaseFanoutModule {
  static register(options: CaseFanoutOptions): DynamicModule {
    return {
      module: CaseFanoutModule,
      imports: [NotificationsModule],
      providers: [
        { provide: CASE_FANOUT_OPTIONS, useValue: options },
        CaseFanoutWorker,
      ],
    };
  }
}

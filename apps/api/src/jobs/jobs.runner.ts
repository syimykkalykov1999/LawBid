import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  CRON_QUEUE,
  CRON_SCHEDULES,
  JOBS_OPTIONS,
  type CronJobName,
} from './jobs.constants';
import { CronProcessor } from './cron.processor';

export interface JobsModuleOptions {
  /** 'api': runs only when JOBS_ENABLED (default true, until the separate
   * worker service exists). 'worker': always runs (src/worker.ts). */
  mode: 'api' | 'worker';
}

/** Retries with backoff for transient DB/Redis errors; bounded history so
 * the queue's Redis footprint stays flat. */
export const CRON_JOB_TEMPLATE_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
} as const;

/**
 * Owns the `cron` BullMQ queue (docs/01 §5.2, docs/06 §6): registers the
 * repeatable schedules and runs the worker that executes them.
 *
 * Multi-instance safety: schedules are BullMQ job schedulers upserted
 * under fixed ids (CRON_SCHEDULES[].name), so every API/worker instance
 * that boots re-upserts the SAME scheduler — there is exactly one
 * schedule per job no matter how many processes run, and BullMQ creates
 * one job per tick. Each job is then processed by exactly one worker
 * (BullMQ job lock). Schedulers whose id is no longer in CRON_SCHEDULES
 * (renamed/removed jobs) are deleted on boot. Handlers are idempotent,
 * so a retry after a crash is harmless.
 */
@Injectable()
export class JobsRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;
  private starting?: Promise<void>;
  private stopping = false;

  constructor(
    @Inject(JOBS_OPTIONS) private readonly options: JobsModuleOptions,
    private readonly config: ConfigService,
    private readonly processor: CronProcessor,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JobsRunner.name);
  }

  get enabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('background jobs disabled in this process');
      return;
    }
    this.starting = this.start();
    if (this.options.mode === 'worker') {
      // The worker process exists only for this: fail its boot loudly.
      await this.starting;
      return;
    }
    // In the API process job infrastructure must never block or break
    // serving HTTP (a Redis hiccup at boot would otherwise hang startup,
    // BullMQ connections retry forever) — start in the background, log.
    this.starting.catch((error: unknown) => {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'cron jobs failed to start in the API process',
      );
    });
  }

  /** Resolves once schedules are registered and the worker runs. */
  whenStarted(): Promise<void> {
    return this.starting ?? Promise.resolve();
  }

  private async start(): Promise<void> {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.queue = new Queue(CRON_QUEUE, { connection: { url } });
    await this.ensureSchedules(this.queue);
    if (this.stopping) return;

    this.worker = new Worker(
      CRON_QUEUE,
      (job: Job) => this.processor.process(job.name),
      {
        // Required by BullMQ for the worker's blocking connection.
        connection: { url, maxRetriesPerRequest: null },
        // One maintenance job at a time per process: DB-heavy sweeps, not
        // latency-sensitive.
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { job: job?.name, attempts: job?.attemptsMade, err: error.message },
        'cron job failed',
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'cron worker error');
    });
    this.logger.info(
      { mode: this.options.mode, jobs: CRON_SCHEDULES.map((s) => s.name) },
      'cron jobs scheduled; worker started',
    );
  }

  /** Idempotent: upserts every schedule, removes stale ones. */
  async ensureSchedules(queue: Queue): Promise<void> {
    const wanted = new Set<string>(CRON_SCHEDULES.map((s) => s.name));
    for (const schedule of CRON_SCHEDULES) {
      await queue.upsertJobScheduler(
        schedule.name,
        { pattern: schedule.pattern, tz: 'UTC' },
        { name: schedule.name, opts: CRON_JOB_TEMPLATE_OPTS },
      );
    }
    const existing = await queue.getJobSchedulers();
    for (const scheduler of existing) {
      if (!wanted.has(scheduler.key)) {
        await queue.removeJobScheduler(scheduler.key);
      }
    }
  }

  /** Enqueue a job now (ops / tests). The queue exists only when enabled. */
  async runNow(name: CronJobName): Promise<Job> {
    if (!this.queue) throw new Error('background jobs are disabled');
    return this.queue.add(name, {}, CRON_JOB_TEMPLATE_OPTS);
  }

  get cronQueue(): Queue | undefined {
    return this.queue;
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    // A background start still in flight would otherwise create the
    // worker after we closed everything.
    await this.starting?.catch(() => undefined);
    // Worker first: lets an in-flight job finish, stops taking new ones.
    await this.worker?.close();
    await this.queue?.close();
  }
}

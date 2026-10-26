import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import type Redis from 'ioredis';
import { OPS_KEYS, WORKER_HEARTBEAT_FILE } from '../common/ops/ops.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  CRON_LANES,
  CRON_LANE_CONCURRENCY,
  CRON_QUEUE,
  CRON_SCHEDULES,
  JOBS_OPTIONS,
  cronLaneOf,
  isSubHourly,
  type CronJobName,
  type CronLane,
} from './jobs.constants';
import { closeWorker, workerTuning } from '../common/queues/queue-hardening';
import { CronProcessor } from './cron.processor';
import { bullOptions } from '../redis/redis-connection';

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

/** S10-13: sub-hourly schedules are their own retry (see isSubHourly). */
export const CRON_FREQUENT_JOB_OPTS = {
  ...CRON_JOB_TEMPLATE_OPTS,
  attempts: 1,
} as const;

/** Job options of one schedule (template for the scheduler, `runNow`). */
export function cronJobOpts(pattern: string) {
  return isSubHourly(pattern) ? CRON_FREQUENT_JOB_OPTS : CRON_JOB_TEMPLATE_OPTS;
}

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
  private readonly queues = new Map<CronLane, Queue>();
  private workers: Worker[] = [];
  private starting?: Promise<void>;
  private stopping = false;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    @Inject(JOBS_OPTIONS) private readonly options: JobsModuleOptions,
    private readonly config: ConfigService,
    private readonly processor: CronProcessor,
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
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
    for (const lane of CRON_LANES) {
      const queue = new Queue(lane, bullOptions(lane, url));
      this.queues.set(lane, queue);
      await this.ensureSchedules(queue, lane);
    }
    if (this.stopping) return;

    for (const lane of CRON_LANES) {
      const worker = new Worker(
        lane,
        (job: Job) => this.processor.process(job.name),
        {
          // Required by BullMQ for the worker's blocking connection.
          ...bullOptions(lane, url, { worker: true }),
          ...workerTuning(lane),
          // S10-2: one lane never waits for another; inside a lane the
          // DB-heavy sweeps still run one (fast: three short) at a time.
          concurrency: CRON_LANE_CONCURRENCY[lane],
        },
      );
      worker.on('failed', (job, error) => {
        this.logger.error(
          {
            lane,
            job: job?.name,
            attempts: job?.attemptsMade,
            err: error.message,
          },
          'cron job failed',
        );
      });
      worker.on('error', (error) => {
        this.logger.error({ lane, err: error.message }, 'cron worker error');
      });
      this.workers.push(worker);
    }
    this.logger.info(
      { mode: this.options.mode, jobs: CRON_SCHEDULES.map((s) => s.name) },
      'cron jobs scheduled; workers started',
    );
    this.startHeartbeat();
  }

  /**
   * Owner 2026-10-05 zero maintenance: every 30 s, while the BullMQ worker
   * runs, touch a local file (the ECS container health check replaces a
   * worker whose file goes stale: hung event loop, dead worker) and a
   * Redis key the admin «Здоровье системы» reads (TTL 180 s).
   */
  private startHeartbeat(): void {
    const beat = async () => {
      try {
        if (
          this.stopping ||
          this.workers.length === 0 ||
          !this.workers.every((w) => w.isRunning())
        ) {
          return;
        }
        const at = new Date().toISOString();
        await writeFile(WORKER_HEARTBEAT_FILE, at).catch(() => undefined);
        await this.redis?.set(
          OPS_KEYS.workerHeartbeat,
          JSON.stringify({
            at,
            pid: process.pid,
            host: hostname(),
            mode: this.options.mode,
          }),
          'EX',
          180,
        );
      } catch {
        // A missed beat is the signal; never crash the process over it.
      }
    };
    void beat();
    this.heartbeat = setInterval(() => void beat(), 30_000);
    this.heartbeat.unref();
  }

  /** Idempotent: upserts the schedules of [lane], removes stale ones (a
   * job renamed or moved to another lane leaves its old scheduler here). */
  async ensureSchedules(
    queue: Queue,
    lane: CronLane = CRON_QUEUE,
  ): Promise<void> {
    const mine = CRON_SCHEDULES.filter((s) => cronLaneOf(s.name) === lane);
    const wanted = new Set<string>(mine.map((s) => s.name));
    for (const schedule of mine) {
      await queue.upsertJobScheduler(
        schedule.name,
        { pattern: schedule.pattern, tz: 'UTC' },
        { name: schedule.name, opts: cronJobOpts(schedule.pattern) },
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
    const queue = this.queues.get(cronLaneOf(name));
    if (!queue) throw new Error('background jobs are disabled');
    const pattern = CRON_SCHEDULES.find((s) => s.name === name)?.pattern ?? '';
    return queue.add(name, {}, cronJobOpts(pattern));
  }

  /** The default lane (kept for callers that only need "a cron queue"). */
  get cronQueue(): Queue | undefined {
    return this.queues.get(CRON_QUEUE);
  }

  /** One lane's queue (ops / tests); undefined while jobs are disabled. */
  laneQueue(lane: CronLane): Queue | undefined {
    return this.queues.get(lane);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    // A background start still in flight would otherwise create the
    // workers after we closed everything.
    await this.starting?.catch(() => undefined);
    // Workers first (in parallel, bounded by the shared drain deadline,
    // S10-9): they stop taking new jobs at once and let running ones finish.
    await Promise.all(this.workers.map((w) => closeWorker(w)));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

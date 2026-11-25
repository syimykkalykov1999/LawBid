import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import type Redis from 'ioredis';
import { OPS_KEYS, WORKER_HEARTBEAT_FILE } from '../common/ops/ops.constants';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { ConfigService } from '@nestjs/config';
import { DelayedError, Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  CRON_JOBS,
  CRON_LANES,
  CRON_LANE_CONCURRENCY,
  CRON_QUEUE,
  CRON_SCHEDULES,
  JOBS_OPTIONS,
  cronLaneOf,
  isOneOffJob,
  isSubHourly,
  type CronJobName,
  type CronLane,
} from './jobs.constants';
import {
  closeWorker,
  workerTuning,
  outageProof,
} from '../common/queues/queue-hardening';
import { CronProcessor } from './cron.processor';
import { withWork } from '../common/ops/loop-stall';
import { bullOptions } from '../redis/redis-connection';
import type { AppSettingKey } from '../common/app-settings/app-settings.defaults';
import { AppSettingsService } from '../common/app-settings/app-settings.service';

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

/**
 * Row 181 (DB scale finding 5, owner rule 11): how many jobs each lane runs
 * at once in one process is an owner setting, read at boot and again on
 * every heartbeat (30 s) and applied to the running worker with BullMQ's
 * own `worker.concurrency` setter (docs.bullmq.io "Concurrency": the value
 * can be changed while the worker runs; a lower value just stops it taking
 * new jobs until the running ones finish). CRON_LANE_CONCURRENCY is the
 * default and the fallback when a value cannot be read or is out of range,
 * so nothing changes until the owner moves a number.
 */
export const CRON_LANE_CONCURRENCY_SETTING: Record<CronLane, AppSettingKey> = {
  'cron-fast': 'ops.cron_lane_concurrency_fast',
  cron: 'ops.cron_lane_concurrency_default',
  'cron-heavy-frequent': 'ops.cron_lane_concurrency_heavy_frequent',
  'cron-heavy': 'ops.cron_lane_concurrency_heavy',
};
/** Ceiling of one lane per process (each running job holds one database
 * connection of the pool). */
export const CRON_LANE_CONCURRENCY_MAX = 20;

/**
 * Pack C (round 2 #12, 25.11): during a deploy the old and the new release
 * run side by side, and each deleted every scheduler it did not know — the
 * other one's — and failed the other one's jobs as «Unknown cron job»
 * (attempts 1: that run was lost). Each process now writes the
 * `lane:name` list of its release into one Redis hash every heartbeat; a
 * scheduler or job that a live release (seen in the last
 * [CRON_RELEASE_TTL_MS]) still has is left to it: the scheduler stays and
 * the job goes back to the queue for that release's worker. Names no live
 * release has are cleaned as before.
 */
export const CRON_RELEASES_KEY = 'cron:releases';
/** A release not seen for this long is gone (the worker heartbeat's TTL). */
export const CRON_RELEASE_TTL_MS = 180_000;
/** A job of another live release waits this long before it is offered again. */
export const CRON_HANDOFF_DELAY_MS = 5_000;
const KNOWN_CRON_JOBS = new Set<string>(Object.values(CRON_JOBS));
export const MY_CRON_SCHEDULES = CRON_SCHEDULES.map(
  (x) => `${cronLaneOf(x.name)}:${x.name}`,
).sort();
export const MY_CRON_RELEASE = createHash('sha1')
  .update(MY_CRON_SCHEDULES.join(','))
  .digest('hex')
  .slice(0, 12);

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
  private readonly laneWorkers = new Map<CronLane, Worker>();
  private starting?: Promise<void>;
  private stopping = false;
  private heartbeat?: NodeJS.Timeout;
  /** `lane:name` of the schedules other live releases have (pack C). */
  private otherReleases = new Set<string>();

  constructor(
    @Inject(JOBS_OPTIONS) private readonly options: JobsModuleOptions,
    private readonly config: ConfigService,
    private readonly processor: CronProcessor,
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
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
    await this.refreshReleases();
    for (const lane of CRON_LANES) {
      const queue = new Queue(lane, bullOptions(lane, url));
      this.queues.set(lane, queue);
      await this.ensureSchedules(queue, lane);
    }
    if (this.stopping) return;

    for (const lane of CRON_LANES) {
      const concurrency = await this.laneConcurrency(lane);
      const run = outageProof((job: Job, signal?: AbortSignal) =>
        withWork(`job ${job.name}`, () =>
          // Verify 5b: one-off delayed jobs carry their own data.
          isOneOffJob(job.name)
            ? this.processor.runOneOff(job.name, job.data)
            : this.processor.process(job.name, signal),
        ),
      );
      const worker = new Worker(
        lane,
        // Batch D (14.11): three declared parameters — BullMQ hands a
        // processor its per-job AbortSignal only when `processor.length`
        // is ≥ 3 (worker.js `processorAcceptsSignal`).
        async (job: Job, token?: string, signal?: AbortSignal) => {
          // Pack C (round 2 #12): another live release's job goes back to
          // the queue for its worker instead of failing here.
          if (token && this.belongsToOtherRelease(lane, job.name)) {
            await job.moveToDelayed(Date.now() + CRON_HANDOFF_DELAY_MS, token);
            throw new DelayedError();
          }
          return run(job, signal);
        },
        {
          // Required by BullMQ for the worker's blocking connection.
          ...bullOptions(lane, url, { worker: true }),
          ...workerTuning(lane),
          // S10-2: one lane never waits for another; inside a lane the
          // DB-heavy sweeps still run one (fast: three short) at a time by
          // default. Row 181: the number is an owner setting.
          concurrency,
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
      // Automation audit 2026-11-08: most jobs logged nothing on success, so
      // nobody could prove from the logs that an automation ran on prod.
      // One line per finished run of every job slower than every-hour-or-so
      // (the every-minute sweeps would flood the log; they have metrics).
      worker.on('completed', (job) => {
        const pattern =
          CRON_SCHEDULES.find((x) => x.name === job.name)?.pattern ?? '';
        if (isSubHourly(pattern)) return;
        this.logger.info(
          {
            lane,
            job: job.name,
            ms:
              job.finishedOn && job.processedOn
                ? job.finishedOn - job.processedOn
                : undefined,
            skipped:
              (job.returnvalue as { skipped?: string } | null)?.skipped ??
              undefined,
          },
          'cron job done',
        );
      });
      worker.on('error', (error) => {
        this.logger.error({ lane, err: error.message }, 'cron worker error');
      });
      // Batch D (14.11), BullMQ "Cancelling jobs": a job whose BullMQ lock
      // could not be renewed (Redis restarted, failover) will be handed to
      // another worker as stalled — stop this copy instead of running both.
      worker.on('lockRenewalFailed', (jobIds: string[]) => {
        for (const id of jobIds) worker.cancelJob(id, 'lock lost');
        this.logger.warn(
          { lane, jobs: jobIds, metric: 'cron_lock_lost' },
          'cron job lock renewal failed; run cancelled',
        );
      });
      this.workers.push(worker);
      this.laneWorkers.set(lane, worker);
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
        await this.refreshReleases();
        await this.reconcileSchedules();
        await this.applyLaneConcurrency();
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

  /** Row 181: the owner's number of parallel jobs for [lane], a whole
   * number 1..CRON_LANE_CONCURRENCY_MAX; the built-in default otherwise. */
  async laneConcurrency(lane: CronLane): Promise<number> {
    const fallback = CRON_LANE_CONCURRENCY[lane];
    const value = this.settings
      ? await this.settings
          .number(CRON_LANE_CONCURRENCY_SETTING[lane])
          .catch(() => Number.NaN)
      : Number.NaN;
    return Number.isInteger(value) &&
      value >= 1 &&
      value <= CRON_LANE_CONCURRENCY_MAX
      ? value
      : fallback;
  }

  /** Row 181: puts a changed owner setting onto the running workers (BullMQ
   * `worker.concurrency` setter). Returns the lanes that changed. Never
   * throws: a failed read keeps the current value. */
  async applyLaneConcurrency(): Promise<CronLane[]> {
    const changed: CronLane[] = [];
    for (const [lane, worker] of this.laneWorkers) {
      try {
        const want = await this.laneConcurrency(lane);
        if (worker.concurrency === want) continue;
        const from = worker.concurrency;
        worker.concurrency = want;
        changed.push(lane);
        this.logger.info(
          { lane, from, to: want, metric: 'cron_lane_concurrency' },
          'cron lane concurrency changed',
        );
      } catch (error) {
        this.logger.warn(
          { lane, err: error instanceof Error ? error.message : String(error) },
          'cron lane concurrency not applied',
        );
      }
    }
    return changed;
  }

  /**
   * S6-1: job schedulers live ONLY in Redis, so a Redis replacement or a
   * failover that loses the last writes would silently stop every cron
   * until the next deploy. Each heartbeat (30 s) counts the schedulers on
   * every lane (S10-2); when one is missing the idempotent
   * [ensureSchedules] puts that lane's back. The count is logged as metric
   * `cron_schedulers` (alarm: `missing` > 0). Never throws.
   */
  async reconcileSchedules(): Promise<number> {
    if (this.queues.size === 0) return 0;
    const expected = CRON_SCHEDULES.length;
    try {
      let count = 0;
      for (const [lane, queue] of this.queues) {
        const mine = CRON_SCHEDULES.filter((x) => cronLaneOf(x.name) === lane);
        const keys = new Set(
          (await queue.getJobSchedulers()).map((x) => x.key),
        );
        const found = mine.filter((x) => keys.has(x.name)).length;
        // Pack C: a scheduler of a release that is gone (a name neither
        // this release nor a live one has) is cleaned without a redeploy.
        const orphan = [...keys].some(
          (k) =>
            !KNOWN_CRON_JOBS.has(k) && !this.otherReleases.has(`${lane}:${k}`),
        );
        if (found < mine.length || orphan) {
          this.logger.warn(
            { lane, found, expected: mine.length },
            'cron schedules missing in Redis; re-registering',
          );
          await this.ensureSchedules(queue, lane);
          count += mine.length;
        } else {
          count += found;
        }
      }
      this.logger.info(
        {
          metric: 'cron_schedulers',
          count,
          expected,
          missing: expected - count,
        },
        'cron schedulers',
      );
      return count;
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'cron schedule check failed',
      );
      return -1;
    }
  }

  /** Idempotent: upserts the schedules of [lane], removes stale ones (a
   * job renamed or moved to another lane leaves its old scheduler here)
   * unless another live release still has it (pack C, round 2 #12). */
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
      if (
        !wanted.has(scheduler.key) &&
        !this.otherReleases.has(`${lane}:${scheduler.key}`)
      ) {
        await queue.removeJobScheduler(scheduler.key);
      }
    }
  }

  /** A job this release does not know that a live release schedules. */
  belongsToOtherRelease(lane: CronLane, name: string): boolean {
    return (
      !isOneOffJob(name) &&
      !KNOWN_CRON_JOBS.has(name) &&
      this.otherReleases.has(`${lane}:${name}`)
    );
  }

  /**
   * Pack C (round 2 #12): writes this release's schedules into
   * [CRON_RELEASES_KEY] and reads the other live releases' (one hash, one
   * key: no cross-slot call); drops releases not seen for
   * [CRON_RELEASE_TTL_MS]. Without Redis, or when it fails: no other
   * release is known (the old clean-everything behaviour). Never throws.
   */
  async refreshReleases(now = Date.now()): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.hset(
        CRON_RELEASES_KEY,
        MY_CRON_RELEASE,
        JSON.stringify({ at: now, names: MY_CRON_SCHEDULES }),
      );
      const all = await this.redis.hgetall(CRON_RELEASES_KEY);
      const other = new Set<string>();
      for (const [release, raw] of Object.entries(all ?? {})) {
        if (release === MY_CRON_RELEASE) continue;
        let entry: { at?: unknown; names?: unknown } | null = null;
        try {
          entry = JSON.parse(raw) as { at?: unknown; names?: unknown };
        } catch {
          entry = null;
        }
        if (
          !entry ||
          typeof entry.at !== 'number' ||
          now - entry.at > CRON_RELEASE_TTL_MS ||
          !Array.isArray(entry.names)
        ) {
          await this.redis.hdel(CRON_RELEASES_KEY, release);
          continue;
        }
        for (const n of entry.names) if (typeof n === 'string') other.add(n);
      }
      this.otherReleases = other;
    } catch (error) {
      this.otherReleases = new Set();
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'cron release list not read',
      );
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
    this.laneWorkers.clear();
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

import {
  Inject,
  Injectable,
  Optional,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { closeWorker, workerTuning } from '../../common/queues/queue-hardening';
import { bullOptions } from '../../redis/redis-connection';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { delSafe } from '../../redis/redis-cluster-safe';

/**
 * Owner 2026-11-04 (R-394): a state-registry lookup never runs inside the
 * admin's click. «По реестру» / «Перепроверить» answer 202 at once with a
 * check id; the lookup runs here, in the BullMQ worker, with a hard
 * timeout, and the result lands on the license (auto_check_result). Same
 * shape as the `files` queue (FileScanRunner): the API enqueues, the
 * worker process (or the API while JOBS_ENABLED) runs the jobs.
 */
export const REGISTRY_CHECK_QUEUE = 'registry-checks';
export const REGISTRY_CHECK_JOB = 'registry.check';
/** Hard ceiling of one queued lookup (a preset may do several requests). */
export const REGISTRY_CHECK_TIMEOUT_MS = 15_000;
/** «проверяется…» mark: removed when the job ends, expires on its own. */
export const REGISTRY_CHECK_PENDING_TTL_SEC = 120;

export type RegistryCheckKind = 'registry' | 'recheck';

export interface RegistryCheckJobData {
  checkId: string;
  licenseId: string;
  kind: RegistryCheckKind;
  adminId: string;
  adminIp: string | null;
  queuedAt: string;
}

export const REGISTRY_CHECK_JOB_OPTS = {
  // One try: a registry that did not answer is shown as «недоступен», the
  // admin confirms by hand or presses the button again.
  attempts: 1,
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
} as const;

const pendingKey = (licenseId: string) => `verif:regcheck:${licenseId}`;

/** Producer side + the «проверяется…» marks (used by the API). */
@Injectable()
export class RegistryCheckQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    this.logger.setContext(RegistryCheckQueue.name);
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.queue = new Queue(
        REGISTRY_CHECK_QUEUE,
        bullOptions(REGISTRY_CHECK_QUEUE, url),
      );
    }
  }

  /**
   * Queues one lookup. A lookup already waiting for the same license is
   * the answer (no second job). Without a queue (unit tests, no Redis) the
   * lookup still runs in the background, never inside the request.
   */
  async enqueue(
    input: Omit<RegistryCheckJobData, 'checkId' | 'queuedAt'>,
    runInline: (data: RegistryCheckJobData) => Promise<void>,
  ): Promise<RegistryCheckJobData> {
    const data: RegistryCheckJobData = {
      ...input,
      checkId: randomUUID(),
      queuedAt: new Date().toISOString(),
    };
    const existing = await this.markPending(data);
    if (existing) return existing;
    if (!this.queue) {
      setImmediate(() => {
        runInline(data).catch((err: unknown) =>
          this.logger.warn(
            { err, licenseId: data.licenseId },
            'registry check failed',
          ),
        );
      });
      return data;
    }
    try {
      await this.queue.add(REGISTRY_CHECK_JOB, data, {
        ...REGISTRY_CHECK_JOB_OPTS,
        jobId: data.checkId,
      });
    } catch (err) {
      await this.clearPending(data.licenseId);
      throw err;
    }
    return data;
  }

  /** The lookups still running, by license id. */
  async pending(
    licenseIds: readonly string[],
  ): Promise<Map<string, RegistryCheckJobData>> {
    const out = new Map<string, RegistryCheckJobData>();
    const redis = this.redis;
    if (!redis || licenseIds.length === 0) return out;
    try {
      // One GET per key: an MGET across slots fails on Redis Cluster.
      const raw = await Promise.all(
        licenseIds.map((id) => redis.get(pendingKey(id))),
      );
      raw.forEach((value, i) => {
        const data = parse(value);
        if (data) out.set(licenseIds[i], data);
      });
    } catch (err) {
      this.logger.warn({ err }, 'registry check marks unavailable');
    }
    return out;
  }

  async clearPending(licenseId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await delSafe(this.redis, [pendingKey(licenseId)]);
    } catch {
      // The mark expires on its own.
    }
  }

  /** Sets the mark; returns the lookup already waiting, if any. */
  private async markPending(
    data: RegistryCheckJobData,
  ): Promise<RegistryCheckJobData | null> {
    const redis = this.redis;
    if (!redis) return null;
    const key = pendingKey(data.licenseId);
    const set = await redis.set(
      key,
      JSON.stringify(data),
      'EX',
      REGISTRY_CHECK_PENDING_TTL_SEC,
      'NX',
    );
    if (set === 'OK') return null;
    return parse(await redis.get(key));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}

/** Runs the queued lookups (worker process, or the API while JOBS_ENABLED). */
@Injectable()
export class RegistryCheckWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private worker?: Worker<RegistryCheckJobData>;
  private handler?: (data: RegistryCheckJobData) => Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegistryCheckWorker.name);
  }

  /** The service registers what a job does (avoids a DI cycle). */
  handle(fn: (data: RegistryCheckJobData) => Promise<void>): void {
    this.handler = fn;
  }

  get enabled(): boolean {
    return this.config.get<boolean>('JOBS_ENABLED') !== false;
  }

  onApplicationBootstrap(): void {
    const url = this.config.get<string>('REDIS_URL');
    if (!url || !this.enabled) return;
    this.worker = new Worker<RegistryCheckJobData>(
      REGISTRY_CHECK_QUEUE,
      async (job: Job<RegistryCheckJobData>) => {
        if (!this.handler) throw new Error('registry check handler missing');
        await this.handler(job.data);
      },
      {
        ...bullOptions(REGISTRY_CHECK_QUEUE, url, { worker: true }),
        ...workerTuning(REGISTRY_CHECK_QUEUE),
        // Lookups wait on other sites, not on our CPU.
        concurrency: 4,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { job: job?.name, licenseId: job?.data.licenseId, err: error.message },
        'registry check job failed',
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error.message }, 'registry check worker error');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
  }
}

function parse(value: string | null): RegistryCheckJobData | null {
  if (!value) return null;
  try {
    const o = JSON.parse(value) as Partial<RegistryCheckJobData>;
    return typeof o.checkId === 'string' && typeof o.licenseId === 'string'
      ? (o as RegistryCheckJobData)
      : null;
  } catch {
    return null;
  }
}

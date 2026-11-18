import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { bullOptions } from '../redis/redis-connection';
import { CRON_FAST_QUEUE, type OneOffJobName } from './jobs.constants';

/**
 * Verify 5b (17.11): the producer side of ONE_OFF_JOBS — the same pattern as
 * SeoGeneratorTrigger (a lazily opened BullMQ Queue on an existing cron lane,
 * a fixed job id, a delay). Any API instance may add; the JobsRunner worker
 * (API or worker process) runs it once: BullMQ ignores an add whose job id
 * already exists, so N instances reporting the same event queue one job.
 */
@Injectable()
export class OneOffJobsQueue implements OnModuleDestroy {
  private queue?: Queue;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
  }

  /** Queues [name] with [data] after [delayMs]. False when Redis is not
   * configured. Throws on a Redis error (the caller decides). */
  async add(
    name: OneOffJobName,
    data: Record<string, unknown>,
    jobId: string,
    delayMs: number,
    opts: { againIfRunning?: boolean } = {},
  ): Promise<boolean> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return false;
    this.queue ??= new Queue(
      CRON_FAST_QUEUE,
      bullOptions(CRON_FAST_QUEUE, url),
    );
    // Final pass 18.11 (FB6): a FAILED job kept under this id (removeOnFail
    // keeps 200) made BullMQ ignore every later add — «queued», nothing ran.
    // It is removed first; a waiting / running one still takes the add.
    const old = await this.queue.getJob(jobId);
    const state = old ? await old.getState() : null;
    if (old && state === 'failed') await old.remove();
    // FO4: [againIfRunning] — the running job may have read the data the
    // caller has just changed (the admin's trust rules): one follow-up run
    // is queued under its own id (itself deduplicated while it waits).
    let id = jobId;
    if (opts.againIfRunning && state === 'active') {
      id = `${jobId}-again`;
      const next = await this.queue.getJob(id);
      if (next && (await next.getState()) === 'failed') await next.remove();
    }
    await this.queue.add(name, data, {
      jobId: id,
      delay: Math.max(0, delayMs),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: { count: 200 },
    });
    return true;
  }
}

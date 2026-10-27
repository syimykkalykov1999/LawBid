import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { CRON_HEAVY_QUEUE, CRON_JOBS } from '../../jobs/jobs.constants';
import { bullOptions } from '../../redis/redis-connection';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';

/** `seo.generator_mode`: off (default) | nightly | nightly+events. Anything
 * else counts as off, so a typo can never start the generator. */
export type SeoGeneratorMode = 'off' | 'nightly' | 'nightly+events';

export function parseSeoGeneratorMode(v: unknown): SeoGeneratorMode {
  return v === 'nightly' || v === 'nightly+events' ? v : 'off';
}

/** What changed on the public pages (log label only). */
export type SeoChangeReason =
  | 'attorney-published'
  | 'attorney-removed'
  | 'attorney-edited'
  | 'post-published';

export const SEO_DIRTY_KEY = 'seo:gen:dirty';
export const SEO_LAST_RUN_KEY = 'seo:gen:last';
/** BullMQ forbids ':' in a custom job id. */
export const SEO_EVENT_JOB_ID = 'seo.generate.event';

export type EnqueueResult =
  'off' | 'no-redis' | 'queued' | 'already-queued' | 'failed';

/**
 * Programmatic SEO (2026-10-27): turns "an attorney was published / removed /
 * edited" into ONE delayed BullMQ job `seo.generate` on the heavy cron lane.
 *
 * - `seo.generator_mode` must be `nightly+events`, else nothing is queued and
 *   Redis is not touched (the default, `off`, costs one cached settings read);
 * - debounce: the job id is fixed, so a burst of events while the delayed job
 *   waits is the same job (`seo.generator_debounce_seconds`, default 60);
 * - at least `seo.generator_min_interval_minutes` (default 10) between runs;
 * - an event that arrives while a run is going leaves a "dirty" mark newer
 *   than the run's start, and the run queues one follow-up when it ends
 *   ({@link afterRun}); the nightly run is the final safety net.
 */
@Injectable()
export class SeoGeneratorTrigger implements OnModuleInit, OnModuleDestroy {
  /** The live instance, for {@link notifySeoPagesChanged}. */
  static current?: SeoGeneratorTrigger;
  private queue?: Queue;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.logger.setContext(SeoGeneratorTrigger.name);
  }

  onModuleInit(): void {
    SeoGeneratorTrigger.current = this;
  }

  async onModuleDestroy(): Promise<void> {
    if (SeoGeneratorTrigger.current === this) {
      SeoGeneratorTrigger.current = undefined;
    }
    await this.queue?.close().catch(() => undefined);
  }

  async mode(): Promise<SeoGeneratorMode> {
    if (!this.settings) return 'off';
    return parseSeoGeneratorMode(
      await this.settings.string('seo.generator_mode'),
    );
  }

  /** A public fact changed: mark dirty and queue the debounced run. */
  async notify(reason: SeoChangeReason): Promise<EnqueueResult> {
    if ((await this.mode()) !== 'nightly+events') return 'off';
    if (!this.redis) return 'no-redis';
    await this.redis.set(SEO_DIRTY_KEY, String(Date.now()), 'EX', 2 * 86_400);
    const res = await this.enqueue();
    this.logger.debug({ reason, res }, 'seo pages changed');
    return res;
  }

  /** Called by the run when it ends: events that came in meanwhile get one more run. */
  async afterRun(startedAtMs: number): Promise<EnqueueResult | null> {
    if (!this.redis || (await this.mode()) !== 'nightly+events') return null;
    const dirty = Number(await this.redis.get(SEO_DIRTY_KEY));
    return dirty > startedAtMs ? this.enqueue() : null;
  }

  private async delayMs(): Promise<number> {
    const debounce = this.settings
      ? await this.settings.number('seo.generator_debounce_seconds')
      : 60;
    const minGap = this.settings
      ? await this.settings.number('seo.generator_min_interval_minutes')
      : 10;
    const last = Number(await this.redis?.get(SEO_LAST_RUN_KEY)) || 0;
    return Math.max(debounce * 1000, last + minGap * 60_000 - Date.now(), 1000);
  }

  private async enqueue(): Promise<EnqueueResult> {
    try {
      const url = this.config.get<string>('REDIS_URL');
      if (!url) return 'no-redis';
      this.queue ??= new Queue(
        CRON_HEAVY_QUEUE,
        bullOptions(CRON_HEAVY_QUEUE, url),
      );
      const before = await this.queue.getJob(SEO_EVENT_JOB_ID);
      if (before) return 'already-queued';
      await this.queue.add(
        CRON_JOBS.seoGenerate,
        {},
        {
          jobId: SEO_EVENT_JOB_ID,
          delay: await this.delayMs(),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return 'queued';
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'seo.generate could not be queued; the nightly run will catch up',
      );
      return 'failed';
    }
  }
}

/**
 * The one-line hook for code that publishes or removes public content
 * (verification, suspension, profile edit, account removal). Fire and
 * forget: it never throws, never waits, and does nothing when the generator
 * is off or not wired (tests, processes without the module).
 */
export function notifySeoPagesChanged(reason: SeoChangeReason): void {
  const trigger = SeoGeneratorTrigger.current;
  if (!trigger) return;
  void trigger.notify(reason).catch(() => undefined);
}

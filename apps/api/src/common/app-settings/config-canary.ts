import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { setCanaryProcess } from './canary-state';
import { inCanary, rolloutSettings } from './config-rollout';

/** Б3: the live API tasks (sorted set, score = last heartbeat, ms). */
export const CANARY_MEMBERS_KEY = 'settings:canary:members';
const HEARTBEAT_MS = 15_000;
/** A task that missed three heartbeats is gone (stopped, replaced). */
const MEMBER_TTL_MS = 3 * HEARTBEAT_MS;

/**
 * Б3: the API tasks (AppModule only, never the worker) join a heartbeat set
 * in Redis; each one decides by itself whether it is a canary task
 * (config-rollout.ts inCanary). Redis away = not canary (old values; the
 * change still reaches everyone when its window ends).
 */
@Injectable()
export class ConfigCanaryCohortService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(ConfigCanaryCohortService.name);
  readonly id = randomUUID();
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
  ) {}

  onModuleInit(): void {
    // Specs build the app many times; they call beat() themselves.
    if (process.env.NODE_ENV === 'test') return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    setCanaryProcess(false);
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.redis.zrem(CANARY_MEMBERS_KEY, this.id);
    } catch {
      // stopping anyway
    }
  }

  /** One heartbeat: refresh this task, drop dead ones, decide. */
  async beat(now = Date.now()): Promise<boolean> {
    try {
      await this.redis.zadd(CANARY_MEMBERS_KEY, now, this.id);
      await this.redis.zremrangebyscore(
        CANARY_MEMBERS_KEY,
        '-inf',
        now - MEMBER_TTL_MS,
      );
      const members = await this.redis.zrange(CANARY_MEMBERS_KEY, 0, '-1');
      const { percent } = rolloutSettings(await this.appConfig.getConfig());
      const on = inCanary(this.id, members, percent);
      setCanaryProcess(on);
      return on;
    } catch (e) {
      setCanaryProcess(false);
      this.log.debug(`canary heartbeat: ${(e as Error).message}`);
      return false;
    }
  }
}

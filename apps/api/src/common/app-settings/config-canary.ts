import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
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
 * Б3: the API tasks (main.ts only: never the worker, a CLI run or a test) join a heartbeat set
 * in Redis; each one decides by itself whether it is a canary task
 * (config-rollout.ts inCanary). Redis away = not canary (old values; the
 * change still reaches everyone when its window ends).
 */
@Injectable()
export class ConfigCanaryCohortService implements OnModuleDestroy {
  private readonly log = new Logger(ConfigCanaryCohortService.name);
  readonly id = randomUUID();
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Review of #1332: the heartbeat starts ONLY in the HTTP API process,
   * after it listens (main.ts calls start()). AppModule is also built by
   * the CLI scripts (apps/api/src/cli/*, createApplicationContext) and the
   * e2e suites: a CLI run joining the set would count as a live API task
   * and could be picked as the canary although it serves no traffic.
   */
  start(): void {
    if (this.timer) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.timer.unref();
  }

  get started(): boolean {
    return this.timer !== undefined;
  }

  async onModuleDestroy(): Promise<void> {
    const started = this.timer !== undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    setCanaryProcess(false);
    if (!started) return;
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

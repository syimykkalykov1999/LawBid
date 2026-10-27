import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { CRON_JOBS } from '../../jobs/jobs.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  isIdleResult,
  nextIdleState,
  shouldSkipTick,
  type IdleState,
} from './cron-idle-backoff';
import { OPS_KEYS } from './ops.constants';
import { triMode } from './tri-mode';

/** Jobs allowed to back off (see cron-idle-backoff.ts for who is not). */
export const IDLE_BACKOFF_JOBS: readonly string[] = [
  CRON_JOBS.searchIndex,
  CRON_JOBS.legalExports,
  CRON_JOBS.videosSweep,
  CRON_JOBS.consultationsSweep,
];

const STATE_TTL_SEC = 24 * 3600;

/**
 * Redis-backed idle state of the back-off jobs. Every method is safe: any
 * Redis or settings failure means "run as usual".
 */
@Injectable()
export class CronIdleBackoffService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  static eligible(job: string): boolean {
    return IDLE_BACKOFF_JOBS.includes(job);
  }

  private async state(job: string): Promise<IdleState | null> {
    const raw = await this.redis.get(OPS_KEYS.cronIdle + job);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as IdleState;
      return typeof v.empty === 'number' && typeof v.lastRunAt === 'string'
        ? v
        : null;
    } catch {
      return null;
    }
  }

  /** True when this tick should be skipped. */
  async shouldSkip(job: string): Promise<boolean> {
    if (!this.settings || !CronIdleBackoffService.eligible(job)) return false;
    try {
      const [mode, afterRuns, everyMin, state] = await Promise.all([
        this.settings.string('ops.cron_idle_backoff'),
        this.settings.number('ops.cron_idle_after_runs'),
        this.settings.number('ops.cron_idle_every_min'),
        this.state(job),
      ]);
      return shouldSkipTick({
        mode: triMode(mode),
        state,
        afterRuns,
        everyMs: everyMin * 60_000,
      });
    } catch {
      return false;
    }
  }

  /** Remember how the run went (a thrown error clears the state). */
  async record(job: string, result: unknown, failed = false): Promise<void> {
    if (!CronIdleBackoffService.eligible(job)) return;
    try {
      if (failed) {
        await this.redis.del(OPS_KEYS.cronIdle + job);
        return;
      }
      const next = nextIdleState(
        await this.state(job),
        isIdleResult(result),
        new Date(),
      );
      await this.redis.set(
        OPS_KEYS.cronIdle + job,
        JSON.stringify(next),
        'EX',
        STATE_TTL_SEC,
      );
    } catch {
      // statistics of the back-off only
    }
  }

  /** A producer created work for [job]: the next tick runs at once. */
  async wake(job: string): Promise<void> {
    try {
      await this.redis.del(OPS_KEYS.cronIdle + job);
    } catch {
      // the slow tick still comes within the back-off period
    }
  }
}

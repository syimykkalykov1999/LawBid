import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';

const DAY = 86_400;

/**
 * Owner 2026-10-14: wrong bar numbers cool down in steps, never a permanent
 * block: after N wrong numbers in a row (owner 2026-10-18: default 5, a
 * number that does not fit its state's format counts too) one hour, after the
 * next N twelve hours, after the next N twenty-four hours (the last step
 * repeats). A correct check clears the count; so do 7 days without a wrong
 * number. Counted per account AND per source IP.
 */
@Injectable()
export class BarAttemptsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
  ) {}

  private keys(userId: string, ip?: string): string[] {
    return [`bar:fails:u:${userId}`, ...(ip ? [`bar:fails:ip:${ip}`] : [])];
  }

  /** Seconds left of a cooldown, or 0. */
  async remainingSeconds(userId: string, ip?: string): Promise<number> {
    let max = 0;
    for (const k of this.keys(userId, ip)) {
      const ttl = await this.redis.ttl(k.replace('fails', 'cool'));
      if (ttl > max) max = ttl;
    }
    return max;
  }

  /** One wrong number. Returns the cooldown (seconds) it started, or 0. */
  async recordFailure(userId: string, ip?: string): Promise<number> {
    const per = Math.max(
      1,
      await this.settings.number('verification.bar_fails_per_step'),
    );
    const hours = (
      await this.settings.string('verification.bar_cooldown_hours')
    )
      .split(',')
      .map((h) => Number(h.trim()))
      .filter((h) => Number.isFinite(h) && h > 0);
    const resetDays = Math.max(
      1,
      await this.settings.number('verification.bar_fail_reset_days'),
    );
    let started = 0;
    for (const k of this.keys(userId, ip)) {
      const fails = await this.redis.incr(k);
      await this.redis.expire(k, resetDays * DAY);
      if (fails % per === 0 && hours.length > 0) {
        const step = Math.min(fails / per - 1, hours.length - 1);
        const seconds = Math.round(hours[step] * 3600);
        await this.redis.set(k.replace('fails', 'cool'), '1', 'EX', seconds);
        started = Math.max(started, seconds);
      }
    }
    return started;
  }

  /** A correct number: start over. */
  async reset(userId: string, ip?: string): Promise<void> {
    const ks = this.keys(userId, ip);
    await this.redis.del(...ks, ...ks.map((k) => k.replace('fails', 'cool')));
  }
}

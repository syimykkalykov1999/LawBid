import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAiBudgetError, type StaffAiFeature } from './staff-ai.types';

/** app_config key of the nightly copy of the month's counter. */
export const SPEND_SNAPSHOT_KEY = 'staff.ai.spend_snapshot';
const COUNTER_TTL_SEC = 40 * 86_400;

export interface StaffAiReservation {
  feature: StaffAiFeature;
  millicents: number;
}

export interface SpendSnapshot {
  month: string;
  millicents: number;
  byFeature: Record<string, number>;
  at: string;
}

/**
 * Staff package T12: the HARD spend guard of AI mode.
 *  - the ceiling is the setting `staff.ai.monthly_cents` (admin → Настройки,
 *    also on the cost registry row); 0 means nothing may be spent;
 *  - the month's spend is one Redis counter in millicents. Every call first
 *    RESERVES its worst-case price (INCRBY, rolled back when it would pass
 *    the ceiling → StaffAiBudgetError) and is settled to the real usage after
 *    the answer, so concurrent workers cannot overshoot;
 *  - the nightly job copies the counter into app_config
 *    (`staff.ai.spend_snapshot`); a flushed Redis is re-seeded from that
 *    copy, so a restart cannot reset the month to zero.
 */
@Injectable()
export class StaffAiBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly staff: StaffSettingsService,
  ) {}

  static monthOf(now: Date): string {
    return now.toISOString().slice(0, 7);
  }

  private key(now: Date): string {
    return `staff:ai:spend:${StaffAiBudgetService.monthOf(now)}`;
  }

  async limitMillicents(): Promise<number> {
    return (await this.staff.number('staff.ai.monthly_cents')) * 1000;
  }

  /** Re-seeds the counter from the stored snapshot when Redis lost it. */
  private async ensureSeeded(now: Date): Promise<void> {
    const key = this.key(now);
    if ((await this.redis.exists(key)) === 1) return;
    const snap = await this.readSnapshot();
    const seed =
      snap && snap.month === StaffAiBudgetService.monthOf(now)
        ? snap.millicents
        : 0;
    // NX: a concurrent process that already seeded / spent wins.
    await this.redis.set(key, String(seed), 'EX', COUNTER_TTL_SEC, 'NX');
  }

  async spent(now: Date = new Date()): Promise<number> {
    await this.ensureSeeded(now);
    return Number((await this.redis.get(this.key(now))) ?? 0);
  }

  async remaining(now: Date = new Date()): Promise<number> {
    return Math.max(
      0,
      (await this.limitMillicents()) - (await this.spent(now)),
    );
  }

  /** Takes `millicents` of this month's budget or throws StaffAiBudgetError. */
  async reserve(
    feature: StaffAiFeature,
    millicents: number,
    now: Date = new Date(),
  ): Promise<StaffAiReservation> {
    const limit = await this.limitMillicents();
    await this.ensureSeeded(now);
    const key = this.key(now);
    const total = await this.redis.incrby(key, millicents);
    if (total > limit) {
      await this.redis.decrby(key, millicents);
      throw new StaffAiBudgetError(limit, total - millicents);
    }
    await this.redis.hincrby(`${key}:f`, feature, millicents);
    await this.redis.expire(`${key}:f`, COUNTER_TTL_SEC);
    return { feature, millicents };
  }

  /** Replaces the reserved worst case with what was really used. */
  async settle(
    res: StaffAiReservation,
    actualMillicents: number,
    now: Date = new Date(),
  ): Promise<void> {
    const diff = actualMillicents - res.millicents;
    if (diff === 0) return;
    const key = this.key(now);
    await this.redis.incrby(key, diff);
    await this.redis.hincrby(`${key}:f`, res.feature, diff);
  }

  /** Gives a reservation back (the call failed before it was billed). */
  async release(
    res: StaffAiReservation,
    now: Date = new Date(),
  ): Promise<void> {
    await this.settle(res, 0, now);
  }

  async readSnapshot(): Promise<SpendSnapshot | null> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: SPEND_SNAPSHOT_KEY },
    });
    const v = row?.value as Partial<SpendSnapshot> | null | undefined;
    if (!v || typeof v.month !== 'string' || typeof v.millicents !== 'number') {
      return null;
    }
    return {
      month: v.month,
      millicents: v.millicents,
      byFeature: v.byFeature ?? {},
      at: v.at ?? '',
    };
  }

  /** Nightly: copies the Redis counter into app_config. */
  async writeSnapshot(now: Date = new Date()): Promise<SpendSnapshot> {
    const millicents = await this.spent(now);
    const raw = await this.redis.hgetall(`${this.key(now)}:f`);
    const byFeature: Record<string, number> = {};
    for (const [f, v] of Object.entries(raw)) byFeature[f] = Number(v);
    const snap: SpendSnapshot = {
      month: StaffAiBudgetService.monthOf(now),
      millicents,
      byFeature,
      at: now.toISOString(),
    };
    const value = snap as unknown as Prisma.InputJsonValue;
    await this.prisma.appConfig.upsert({
      where: { key: SPEND_SNAPSHOT_KEY },
      create: { key: SPEND_SNAPSHOT_KEY, value },
      update: { value },
    });
    return snap;
  }
}

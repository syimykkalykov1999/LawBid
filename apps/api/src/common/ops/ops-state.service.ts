import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  AUTO_PAUSE_TTL_SEC,
  HEAVY_QUEUES,
  OPS_KEYS,
  parseJson,
  type BackupSnapshot,
  type BillingDuplicatesDay,
  type BloatSnapshot,
  type CapacityReading,
  type CeilingSnapshot,
  type CostSnapshot,
  type DbProbe,
  type EconomyEvent,
  type EconomyState,
  type HeavyPause,
  type ScaleMode,
} from './ops.constants';
import { bullOptions } from '../../redis/redis-connection';

/** Owner 2026-10-05: the shared operations state (see ops.constants). */
@Injectable()
export class OpsStateService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async heavyPause(): Promise<HeavyPause | null> {
    return parseJson<HeavyPause>(await this.redis.get(OPS_KEYS.heavyPaused));
  }

  async isHeavyPaused(): Promise<boolean> {
    try {
      return (await this.redis.exists(OPS_KEYS.heavyPaused)) === 1;
    } catch {
      // Redis trouble must not stop background work by itself.
      return false;
    }
  }

  /**
   * Pause (or resume) heavy background work. An owner pause stays until
   * the owner resumes; an automatic one expires after AUTO_PAUSE_TTL_SEC
   * and never overrides an owner pause.
   */
  async setHeavyPaused(
    paused: boolean,
    by: 'owner' | 'auto',
    reason: string,
    now: Date = new Date(),
  ): Promise<void> {
    if (!paused) {
      if (by === 'auto') {
        const cur = await this.heavyPause();
        if (cur?.by === 'owner') return;
      }
      await this.redis.del(OPS_KEYS.heavyPaused);
      await this.setQueuesPaused(false);
      return;
    }
    const value = JSON.stringify({ by, at: now.toISOString(), reason });
    if (by === 'owner') {
      await this.redis.set(OPS_KEYS.heavyPaused, value);
    } else {
      const cur = await this.heavyPause();
      if (cur?.by === 'owner') return;
      await this.redis.set(
        OPS_KEYS.heavyPaused,
        value,
        'EX',
        AUTO_PAUSE_TTL_SEC,
      );
    }
    await this.setQueuesPaused(true);
  }

  private queues?: Queue[];

  private heavyQueues(): Queue[] {
    if (!this.queues) {
      const url = this.config.get<string>('REDIS_URL');
      this.queues = url
        ? HEAVY_QUEUES.map((name) => new Queue(name, bullOptions(name, url)))
        : [];
    }
    return this.queues;
  }

  /** BullMQ global pause of the export queues (jobs wait, none is lost).
   * An expired auto pause is resumed by the next guard tick. */
  async setQueuesPaused(paused: boolean): Promise<void> {
    for (const q of this.heavyQueues()) {
      if (paused) await q.pause();
      else await q.resume();
    }
  }

  /** Re-syncs the queues with the pause key (an auto pause expires by TTL,
   * nobody resumes the queues at that moment). */
  async syncQueues(): Promise<void> {
    const paused = await this.isHeavyPaused();
    for (const q of this.heavyQueues()) {
      if ((await q.isPaused()) !== paused) {
        if (paused) await q.pause();
        else await q.resume();
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all((this.queues ?? []).map((q) => q.close()));
  }

  async scaleMode(): Promise<ScaleMode | null> {
    return parseJson<ScaleMode>(await this.redis.get(OPS_KEYS.scaleMode));
  }

  async setScaleMode(mode: ScaleMode): Promise<void> {
    await this.redis.set(OPS_KEYS.scaleMode, JSON.stringify(mode));
  }

  async cost(): Promise<CostSnapshot | null> {
    return parseJson<CostSnapshot>(await this.redis.get(OPS_KEYS.cost));
  }

  async setCost(c: CostSnapshot): Promise<void> {
    await this.redis.set(OPS_KEYS.cost, JSON.stringify(c), 'EX', 6 * 3600);
  }

  async lastBackup(): Promise<BackupSnapshot | null> {
    return parseJson<BackupSnapshot>(await this.redis.get(OPS_KEYS.lastBackup));
  }

  async setLastBackup(b: BackupSnapshot): Promise<void> {
    await this.redis.set(OPS_KEYS.lastBackup, JSON.stringify(b));
  }

  async dbProbe(): Promise<DbProbe | null> {
    return parseJson<DbProbe>(await this.redis.get(OPS_KEYS.dbProbe));
  }

  async setDbProbe(p: DbProbe): Promise<void> {
    await this.redis.set(OPS_KEYS.dbProbe, JSON.stringify(p), 'EX', 600);
  }

  // --- economy guard (owner 2026-10-16) -----------------------------------

  async economy(): Promise<EconomyState | null> {
    return parseJson<EconomyState>(await this.redis.get(OPS_KEYS.economy));
  }

  async setEconomy(state: EconomyState | null): Promise<void> {
    this.economyCache = undefined;
    if (!state) await this.redis.del(OPS_KEYS.economy);
    else await this.redis.set(OPS_KEYS.economy, JSON.stringify(state));
  }

  private economyCache?: { at: number; limited: boolean };

  /**
   * Hot-path question («are paid extras paused right now?») asked by the
   * OTP and video services. Cached 15 s in the process; a Redis hiccup
   * answers «no» — the guard must never block users by accident.
   */
  async isEconomyLimited(now: number = Date.now()): Promise<boolean> {
    if (this.economyCache && now - this.economyCache.at < 15_000) {
      return this.economyCache.limited;
    }
    let limited = false;
    try {
      limited = (await this.economy())?.guard === 'limited';
    } catch {
      limited = false;
    }
    this.economyCache = { at: now, limited };
    return limited;
  }

  async ceiling(): Promise<CeilingSnapshot | null> {
    return parseJson<CeilingSnapshot>(await this.redis.get(OPS_KEYS.ceiling));
  }

  async setCeiling(c: CeilingSnapshot): Promise<void> {
    await this.redis.set(OPS_KEYS.ceiling, JSON.stringify(c));
  }

  async bloat(): Promise<BloatSnapshot | null> {
    return parseJson<BloatSnapshot>(await this.redis.get(OPS_KEYS.dbBloat));
  }

  /** Kept 3 days: one missed night still shows the last reading. */
  async setBloat(b: BloatSnapshot): Promise<void> {
    await this.redis.set(OPS_KEYS.dbBloat, JSON.stringify(b), 'EX', 3 * 86400);
  }

  async capacity(): Promise<CapacityReading | null> {
    return parseJson<CapacityReading>(await this.redis.get(OPS_KEYS.capacity));
  }

  async setCapacity(c: CapacityReading): Promise<void> {
    await this.redis.set(OPS_KEYS.capacity, JSON.stringify(c), 'EX', 3600);
  }

  async economyEvents(limit = 20): Promise<EconomyEvent[]> {
    const raw = await this.redis.lrange(OPS_KEYS.economyEvents, 0, limit - 1);
    return raw
      .map((r) => parseJson<EconomyEvent>(r))
      .filter((e): e is EconomyEvent => e !== null);
  }

  async pushEconomyEvent(e: EconomyEvent): Promise<void> {
    await this.redis.lpush(OPS_KEYS.economyEvents, JSON.stringify(e));
    await this.redis.ltrim(OPS_KEYS.economyEvents, 0, 49);
  }

  /** True the first time per [ttlSec] for [key] (one alert per window). */
  async firstTime(key: string, ttlSec: number): Promise<boolean> {
    return (
      (await this.redis.set(
        OPS_KEYS.pressureFlag + key,
        '1',
        'EX',
        ttlSec,
        'NX',
      )) === 'OK'
    );
  }

  /** Algo audit M-4: today's duplicate-subscription auto-fixes (null = none). */
  async billingDuplicates(
    now: Date = new Date(),
  ): Promise<BillingDuplicatesDay | null> {
    const d = parseJson<BillingDuplicatesDay>(
      await this.redis.get(OPS_KEYS.billingDuplicates),
    );
    return d && d.day === now.toISOString().slice(0, 10) ? d : null;
  }

  /** Adds one outcome to today's counters (read-modify-write; a lost
   * increment under a race only under-counts a notice, never money). */
  async noteBillingDuplicate(
    outcome: 'fixed' | 'needsReview' | 'blocked',
    refundedCents = 0,
    now: Date = new Date(),
  ): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    const cur = (await this.billingDuplicates(now)) ?? {
      day,
      fixed: 0,
      refundedCents: 0,
      needsReview: 0,
      blocked: 0,
      lastAt: now.toISOString(),
    };
    cur[outcome] += 1;
    cur.refundedCents += Math.max(0, refundedCents);
    cur.lastAt = now.toISOString();
    await this.redis.set(
      OPS_KEYS.billingDuplicates,
      JSON.stringify(cur),
      'EX',
      3 * 86400,
    );
  }

  async workerHeartbeat(): Promise<{ at: string; mode: string } | null> {
    return parseJson(await this.redis.get(OPS_KEYS.workerHeartbeat));
  }
}

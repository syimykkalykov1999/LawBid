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
  type CostSnapshot,
  type DbProbe,
  type HeavyPause,
  type ScaleMode,
} from './ops.constants';

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
        ? HEAVY_QUEUES.map((name) => new Queue(name, { connection: { url } }))
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

  async workerHeartbeat(): Promise<{ at: string; mode: string } | null> {
    return parseJson(await this.redis.get(OPS_KEYS.workerHeartbeat));
  }
}

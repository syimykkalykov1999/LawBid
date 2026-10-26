import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { AppSettingsService } from '../../app-settings/app-settings.service';

export type HardStopKind = 'bunny' | 'cloudflare';
export type HardStopMode = 'off' | 'on' | 'auto';

/** Same key as `USAGE_SNAPSHOT_KEY` in jobs/handlers/usage-poll.job.ts (a
 * spec pins the two together; common code must not import from jobs). */
export const USAGE_SNAPSHOT_REDIS_KEY = 'ops:usage:v1';

export const HARD_STOP_SETTING = {
  bunny: 'scale.bunny_hardstop.mode',
  cloudflare: 'scale.cloudflare_hardstop.mode',
} as const;

interface UsageSnapshotLike {
  at?: string;
  cloudflare?: { level?: string };
  bunny?: { bandwidthLevel?: string; storageLevel?: string };
}

export function parseHardStopMode(v: unknown): HardStopMode {
  return v === 'off' || v === 'on' || v === 'auto' ? v : 'auto';
}

/**
 * Pure: should [kind] be stopped? `on` stops now, `off` never, `auto` when
 * this month's poll reached the urgent level («crit»). A poll from another
 * month says nothing (the first poll of a new month clears it).
 */
export function hardStopDecision(
  kind: HardStopKind,
  mode: HardStopMode,
  snap: UsageSnapshotLike | null,
  now: Date,
): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  if (!snap?.at || snap.at.slice(0, 7) !== now.toISOString().slice(0, 7)) {
    return false;
  }
  if (kind === 'cloudflare') return snap.cloudflare?.level === 'crit';
  return (
    snap.bunny?.bandwidthLevel === 'crit' || snap.bunny?.storageLevel === 'crit'
  );
}

/**
 * Cost registry V7 (owner 2026-10-25): the usage alarms for Bunny and
 * Cloudflare Realtime were e-mails only. This lets the app act on them: new
 * video uploads pause (Bunny) and group calls fall back to
 * device-to-device (Cloudflare) at the urgent threshold, per a three-state
 * switch. Hot-path safe: cached 60 s, a Redis or settings hiccup answers
 * «not stopped» (this guard must never block users by accident).
 */
@Injectable()
export class UsageHardStopService {
  private cache = new Map<HardStopKind, { at: number; stopped: boolean }>();

  constructor(
    private readonly settings: AppSettingsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async mode(kind: HardStopKind): Promise<HardStopMode> {
    try {
      return parseHardStopMode(
        await this.settings.string(HARD_STOP_SETTING[kind]),
      );
    } catch {
      return 'auto';
    }
  }

  async stopped(
    kind: HardStopKind,
    nowMs: number = Date.now(),
  ): Promise<boolean> {
    const hit = this.cache.get(kind);
    if (hit && nowMs - hit.at < 60_000) return hit.stopped;
    let stopped = false;
    try {
      const mode = await this.mode(kind);
      let snap: UsageSnapshotLike | null = null;
      if (mode === 'auto' && this.redis) {
        const raw = await this.redis.get(USAGE_SNAPSHOT_REDIS_KEY);
        snap = raw ? (JSON.parse(raw) as UsageSnapshotLike) : null;
      }
      stopped = hardStopDecision(kind, mode, snap, new Date(nowMs));
    } catch {
      stopped = false;
    }
    this.cache.set(kind, { at: nowMs, stopped });
    return stopped;
  }
}

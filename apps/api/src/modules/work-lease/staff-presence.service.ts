import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { StaffStatus } from '../../common/staff-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { ck } from '../../redis/redis-cluster-safe';
import { StaffSettingsService } from '../staff-core/staff-settings.service';

/** Redis keys of one admin share a hash tag, so a pipeline stays in one slot. */
const key = (adminId: string, part: 'pres' | 'act' | 'seen' | 'away') =>
  ck(`staff:${adminId}`, `staff:${part}:${adminId}`);

/** A manual «отошёл» lasts at most one working day. */
const MANUAL_AWAY_SECONDS = 12 * 3600;
/** «Last seen» outlives the 45 s key: the sweep needs it for the 60 s grace. */
const SEEN_SECONDS = 24 * 3600;

export interface PresenceReading {
  /** Last heartbeat (ms since epoch), null = never / long ago. */
  seenMs: number | null;
  /** The 45 s key is alive: the person's tab is signalling. */
  signalling: boolean;
  /** Last time there was mouse / keyboard movement (ms), null = none within the idle window. */
  activeMs: number | null;
  manualAway: boolean;
}

/**
 * Staff package T3 (plan B2): who is on the line.
 *  - heartbeat every 15 s from an open desk tab -> `staff:pres:{id}` with a
 *    45 s life (one pipeline, no database write); with movement also
 *    `staff:act:{id}` (timestamp, lives `lease.idle_release_sec`);
 *  - online = signal alive and movement within `presence.active_window_sec`
 *    (3 min); away = signal alive without movement, or a manual «отошёл»;
 *    offline = no signal for 45 s;
 *  - a 60 s grace (`presence.grace_sec`) before a lease is returned is the
 *    caller's rule (`LeaseService.sweep` / the gateway timer), using `seenMs`.
 * This is about STAFF only; it never touches the mobile app's `presence`.
 */
@Injectable()
export class StaffPresenceService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly staff: StaffSettingsService,
  ) {}

  /** One heartbeat. Returns the resulting status. */
  async heartbeat(
    adminId: string,
    active: boolean,
    now = Date.now(),
  ): Promise<StaffStatus> {
    const n = (await this.staff.get()).numbers;
    const pipe = this.redis
      .pipeline()
      .set(key(adminId, 'pres'), String(now), 'EX', n['staff.presence.ttl_sec'])
      .set(key(adminId, 'seen'), String(now), 'EX', SEEN_SECONDS)
      .get(key(adminId, 'away'));
    if (active) {
      pipe.set(
        key(adminId, 'act'),
        String(now),
        'EX',
        n['staff.lease.idle_release_sec'],
      );
    } else {
      pipe.get(key(adminId, 'act'));
    }
    const res = await pipe.exec();
    const away = res?.[2]?.[1] != null;
    const lastActive = active ? now : Number(res?.[3]?.[1] ?? 0) || null;
    return this.statusOf(
      { signalling: true, manualAway: away, activeMs: lastActive },
      now,
      n['staff.presence.active_window_sec'],
    );
  }

  /** Manual «отошёл» on or off. */
  async setAway(adminId: string, away: boolean): Promise<void> {
    if (away) {
      await this.redis.set(
        key(adminId, 'away'),
        '1',
        'EX',
        MANUAL_AWAY_SECONDS,
      );
    } else {
      await this.redis.del(key(adminId, 'away'));
    }
  }

  async read(adminId: string): Promise<PresenceReading> {
    const [pres, act, seen, away] = await this.redis.mget(
      key(adminId, 'pres'),
      key(adminId, 'act'),
      key(adminId, 'seen'),
      key(adminId, 'away'),
    );
    return {
      seenMs: Number(seen) || null,
      signalling: pres != null,
      activeMs: Number(act) || null,
      manualAway: away != null,
    };
  }

  /** Several people at once (head's team view): one round trip each, in parallel. */
  async readMany(adminIds: string[]): Promise<Map<string, PresenceReading>> {
    const rows = await Promise.all(adminIds.map((id) => this.read(id)));
    return new Map(adminIds.map((id, i) => [id, rows[i]]));
  }

  async status(adminId: string, now = Date.now()): Promise<StaffStatus> {
    const [reading, n] = await Promise.all([
      this.read(adminId),
      this.staff.get(),
    ]);
    return this.statusOf(
      reading,
      now,
      n.numbers['staff.presence.active_window_sec'],
    );
  }

  statusOf(
    r: Pick<PresenceReading, 'signalling' | 'manualAway' | 'activeMs'>,
    now: number,
    activeWindowSec: number,
  ): StaffStatus {
    if (!r.signalling) return 'offline';
    if (r.manualAway) return 'away';
    return r.activeMs !== null && now - r.activeMs <= activeWindowSec * 1000
      ? 'online'
      : 'away';
  }
}

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type Redis from 'ioredis';
import {
  STAFF_NAMESPACE,
  STAFF_SERVER_EVENTS,
  staffAdminRoom,
  staffHeadRoom,
} from '../../common/staff-events';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  shardedBroadcast,
  socketAdapterMode,
} from '../realtime/realtime-publisher.service';

/** `team:tiles` goes out at most this often per workspace (plan B2). */
const TILES_EVERY_MS = 2_000;

export interface TeamTileDiff {
  adminId: string;
  status?: string;
  /** What the person holds now (kind + item), null = unchanged. */
  items?: Array<{ kind: string; itemId: string; leasedUntil: string | null }>;
}

/**
 * Staff package T3: sends events to the `/staff` namespace from ANY
 * process (the API and the worker's sweep job), through the same Redis
 * channel the Socket.IO adapter listens on. Best effort: the database and
 * REST stay the truth, a lost event is repaired by the next `lease/me`.
 */
@Injectable()
export class StaffEventsPublisher implements OnModuleDestroy {
  private readonly emitter: ReturnType<Emitter['of']>;
  private readonly sharded: boolean;
  private tiles = new Map<string, Map<string, TeamTileDiff>>();
  private tilesTimer: NodeJS.Timeout | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.emitter = new Emitter(redis).of(STAFF_NAMESPACE);
    this.sharded =
      socketAdapterMode() === 'sharded' &&
      typeof (redis as Partial<Redis>).spublish === 'function';
  }

  onModuleDestroy(): void {
    if (this.tilesTimer) clearTimeout(this.tilesTimer);
    this.tilesTimer = null;
  }

  toAdmin(adminId: string, event: string, data: unknown): void {
    this.toRoom(staffAdminRoom(adminId), event, data);
  }

  toRoom(room: string, event: string, data: unknown): void {
    if (this.redis.status !== 'ready') return;
    try {
      if (this.sharded) {
        const { channel, message } = shardedBroadcast(
          STAFF_NAMESPACE,
          [room],
          event,
          data,
        );
        void this.redis.spublish(channel, message).catch(() => undefined);
        return;
      }
      this.emitter.to(room).emit(event, data);
    } catch {
      // best-effort (see class doc)
    }
  }

  /** Queues a tile change for the head room; flushed at most every 2 s. */
  tile(workspace: string, diff: TeamTileDiff): void {
    let room = this.tiles.get(workspace);
    if (!room)
      this.tiles.set(workspace, (room = new Map<string, TeamTileDiff>()));
    room.set(diff.adminId, { ...room.get(diff.adminId), ...diff });
    if (this.tilesTimer) return;
    this.tilesTimer = setTimeout(() => this.flushTiles(), TILES_EVERY_MS);
    this.tilesTimer.unref();
  }

  flushTiles(): void {
    this.tilesTimer = null;
    const pending = this.tiles;
    this.tiles = new Map();
    for (const [workspace, diffs] of pending) {
      const payload = { tiles: [...diffs.values()] };
      this.toRoom(
        staffHeadRoom(workspace),
        STAFF_SERVER_EVENTS.teamTiles,
        payload,
      );
      // The owner sees every workspace.
      if (workspace !== 'owner') {
        this.toRoom(
          staffHeadRoom('owner'),
          STAFF_SERVER_EVENTS.teamTiles,
          payload,
        );
      }
    }
  }
}

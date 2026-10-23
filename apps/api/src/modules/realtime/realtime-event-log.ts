import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** How long a missed event can still be fetched (owner 2026-10-23). */
export const EVENT_LOG_WINDOW_MS = 5 * 60_000;
/** Newest events kept per person; more than this and the client must do
 * a full refresh (`complete: false`). */
export const EVENT_LOG_MAX = 200;
/** One event bigger than this is logged as a marker only (the client
 * refetches that screen). */
export const EVENT_LOG_MAX_BYTES = 8 * 1024;
/** A single publish to more people than this carries no `seq` and is not
 * logged (huge audiences refetch on reconnect). */
export const EVENT_LOG_MAX_FANOUT = 1000;

const SEQ_KEY = 'rt:seq';
const logKey = (userId: string) => `rt:log:${userId}`;

/**
 * A strictly increasing number built from Redis' own clock:
 * `milliseconds * 1000`, bumped by one when two events share a
 * millisecond. One clock for every API instance and the worker, so two
 * events for the same person can never swap order. It is a cursor, not a
 * counter: numbers are not contiguous.
 */
const NEXT_SEQ_LUA = `
local t = redis.call('TIME')
local now = (t[1] * 1000 + math.floor(t[2] / 1000)) * 1000
local last = tonumber(redis.call('GET', KEYS[1]) or '0')
local nxt = now
if last >= now then nxt = last + 1 end
redis.call('SET', KEYS[1], nxt, 'PX', 600000)
return nxt
`;

export interface LoggedEvent {
  seq: number;
  event: string;
  /** Absent when the payload was too big to keep: refetch that screen. */
  data?: unknown;
  truncated?: true;
}

export interface MissedEvents {
  /** Newest cursor the server knows; the client continues from it. */
  seq: number;
  events: LoggedEvent[];
  /** false: some events are gone (the gap is older than 5 minutes or the
   * list overflowed) — do the full refresh once, then continue from `seq`. */
  complete: boolean;
}

/** The window start, as a cursor value. */
export const windowStartSeq = (now: number): number =>
  (now - EVENT_LOG_WINDOW_MS) * 1000;

/**
 * Owner 2026-10-23 (big platform architecture, part C2): Redis has no
 * Socket.IO connection-state recovery for the Redis adapters
 * (`@socket.io/redis-adapter` ships none; the streams adapter would need
 * a new Redis feature set), so reconnects were answered by every screen
 * re-reading its list. Instead every event sent to a person carries a
 * `seq` cursor and is kept 5 minutes in `rt:log:{userId}` (a sorted set);
 * after a reconnect the client asks once for everything after its last
 * `seq` (`sync:since` on the socket or `GET /realtime/missed`).
 * Best-effort like the rest of realtime: Redis trouble means "no seq".
 */
@Injectable()
export class RealtimeEventLog {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** True when this Redis can run the sequence script (test doubles can't). */
  get available(): boolean {
    return typeof (this.redis as Partial<Redis>).eval === 'function';
  }

  async nextSeq(): Promise<number> {
    return Number(await this.redis.eval(NEXT_SEQ_LUA, 1, SEQ_KEY));
  }

  /** Newest cursor handed out; with none live, just below the next one
   * (Redis' clock), so every later event is greater than it. */
  async currentSeq(): Promise<number> {
    const n = Number(await this.redis.get(SEQ_KEY));
    if (Number.isFinite(n) && n > 0) return n;
    const [sec, micro] = await this.redis.time();
    return (Number(sec) * 1000 + Math.floor(Number(micro) / 1000)) * 1000 - 1;
  }

  /** Keeps [event] for each of [userIds] under cursor [seq]. */
  async append(
    userIds: string[],
    seq: number,
    event: string,
    data: unknown,
  ): Promise<void> {
    let member = JSON.stringify({ seq, event, data });
    if (member.length > EVENT_LOG_MAX_BYTES) {
      member = JSON.stringify({ seq, event, truncated: true });
    }
    const floor = windowStartSeq(Date.now());
    const ttlSec = Math.ceil(EVENT_LOG_WINDOW_MS / 1000) + 30;
    const pipe = this.redis.pipeline();
    for (const id of new Set(userIds)) {
      const key = logKey(id);
      pipe.zadd(key, seq, member);
      pipe.zremrangebyscore(key, '-inf', `(${floor}`);
      pipe.zremrangebyrank(key, 0, -(EVENT_LOG_MAX + 1));
      pipe.expire(key, ttlSec);
    }
    await pipe.exec();
  }

  /** Everything logged for [userIds] after [since], oldest first. */
  async since(
    userIds: string[],
    since: number,
    now = Date.now(),
  ): Promise<MissedEvents> {
    const ids = [...new Set(userIds)];
    const floor = windowStartSeq(now);
    const pipe = this.redis.pipeline();
    for (const id of ids) {
      pipe.zrangebyscore(logKey(id), `(${since}`, '+inf');
      pipe.zrangebyscore(
        logKey(id),
        '-inf',
        '+inf',
        'WITHSCORES',
        'LIMIT',
        0,
        1,
      );
      pipe.zcard(logKey(id));
    }
    const rows = (await pipe.exec()) ?? [];
    const events: LoggedEvent[] = [];
    // Older than the window: nothing can be promised.
    let complete = since >= floor;
    ids.forEach((_, i) => {
      const members = (rows[i * 3]?.[1] ?? []) as string[];
      const oldest = (rows[i * 3 + 1]?.[1] ?? []) as string[];
      const size = Number(rows[i * 3 + 2]?.[1] ?? 0);
      // A full list whose oldest entry is newer than the cursor may have
      // dropped events in between.
      if (size >= EVENT_LOG_MAX && Number(oldest[1]) > since) complete = false;
      for (const m of members) {
        try {
          events.push(JSON.parse(m) as LoggedEvent);
        } catch {
          complete = false;
        }
      }
    });
    events.sort((a, b) => a.seq - b.seq);
    // One event sent to an assistant and their attorney sits in both logs.
    const unique = events.filter(
      (e, i) => i === 0 || e.seq !== events[i - 1].seq,
    );
    return { seq: await this.currentSeq(), events: unique, complete };
  }
}

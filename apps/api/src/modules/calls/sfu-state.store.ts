import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

/** Tracks a phone may publish into an SFU call (design doc §6). */
export const SFU_TRACK_NAMES = ['mic', 'cam'] as const;
export type SfuTrackName = (typeof SFU_TRACK_NAMES)[number];

/** Everything we remember about one person's Cloudflare session in a call. */
export interface SfuUserState {
  sessionId: string;
  /** What this person publishes: trackName -> mid of their own offer. */
  tracks: Partial<Record<SfuTrackName, string>>;
  /** What this person pulls: their own mid -> whose track it is. */
  pulls: Record<
    string,
    { userId: string; trackName: SfuTrackName; publisherSessionId: string }
  >;
  /** An SFU offer was handed out and its answer is still due (ms). */
  negotiatingSince: number | null;
  createdAt: number;
}

/** Calls never run longer than 4 h (same bound as the LiveKit token). */
export const SFU_STATE_TTL_SEC = 6 * 60 * 60;
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 10_000;
const LOCK_POLL_MS = 40;

const stateKey = (callId: string) => `sfu:call:${callId}`;
const lockKey = (callId: string, userId: string) =>
  `sfu:lock:${callId}:${userId}`;

/**
 * Per-call SFU state. Redis hash `sfu:call:{callId}`, field = user id, value
 * = JSON of [SfuUserState], TTL 6 h. Without a ready Redis (unit tests, a
 * dev box) it lives in this process only: fine for one instance, and the
 * production API always has Redis.
 */
export class SfuStateStore {
  private readonly mem = new Map<string, Map<string, SfuUserState>>();
  /** In-process tail of the queue per (call, user). */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(private readonly redis?: Redis) {}

  private get live(): Redis | null {
    return this.redis && this.redis.status === 'ready' ? this.redis : null;
  }

  async get(callId: string, userId: string): Promise<SfuUserState | null> {
    const r = this.live;
    if (r) {
      const raw = await r.hget(stateKey(callId), userId);
      return raw ? (JSON.parse(raw) as SfuUserState) : null;
    }
    return this.mem.get(callId)?.get(userId) ?? null;
  }

  async set(
    callId: string,
    userId: string,
    state: SfuUserState,
  ): Promise<void> {
    const r = this.live;
    if (r) {
      await r
        .multi()
        .hset(stateKey(callId), userId, JSON.stringify(state))
        .expire(stateKey(callId), SFU_STATE_TTL_SEC)
        .exec();
      return;
    }
    let m = this.mem.get(callId);
    if (!m) {
      m = new Map<string, SfuUserState>();
      this.mem.set(callId, m);
    }
    m.set(userId, state);
  }

  async del(callId: string, userId: string): Promise<void> {
    const r = this.live;
    if (r) {
      await r.hdel(stateKey(callId), userId);
      return;
    }
    this.mem.get(callId)?.delete(userId);
  }

  async all(callId: string): Promise<Record<string, SfuUserState>> {
    const r = this.live;
    if (r) {
      const raw = await r.hgetall(stateKey(callId));
      const out: Record<string, SfuUserState> = {};
      for (const [u, v] of Object.entries(raw)) {
        out[u] = JSON.parse(v) as SfuUserState;
      }
      return out;
    }
    return Object.fromEntries(this.mem.get(callId) ?? []);
  }

  async delCall(callId: string): Promise<void> {
    const r = this.live;
    if (r) await r.del(stateKey(callId));
    this.mem.delete(callId);
  }

  /**
   * The mutation queue: one at a time per (call, user) = per Cloudflare
   * session, across API instances (Redis lock) and inside this one (promise
   * chain, so waiters do not all poll Redis). Cloudflare wants an SDP
   * exchange finished before the next mutation of the same session.
   */
  async withSession<T>(
    callId: string,
    userId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = lockKey(callId, userId);
    const prev = this.tails.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => this.locked(key, fn));
    this.tails.set(key, run);
    try {
      return await run;
    } finally {
      if (this.tails.get(key) === run) this.tails.delete(key);
    }
  }

  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const r = this.live;
    if (!r) return fn();
    const token = randomUUID();
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const ok = await r.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
      if (ok === 'OK') break;
      if (Date.now() > deadline) throw new Error('sfu lock timeout');
      await new Promise((res) => setTimeout(res, LOCK_POLL_MS));
    }
    try {
      return await fn();
    } finally {
      // Release only our own lock (it may have expired and been retaken).
      await r
        .eval(
          "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
          1,
          key,
          token,
        )
        .catch(() => undefined);
    }
  }
}

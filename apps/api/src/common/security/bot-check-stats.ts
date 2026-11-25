import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Item 13 (L2, 2026-11-25): the route groups whose bot check (Firebase App
 * Check on the phones, App Check or Cloudflare Turnstile on the website) has
 * its own admin switch `security.app_check.<group>.mode` (Выкл / Вкл / Авто).
 *   sms            — a code by SMS (sign-in AND registration) and «is this
 *                    number registered»: the SMS-pumping door.
 *   login          — password sign-in, code check (opens a new account on
 *                    first use), Google / Apple sign-in.
 *   password_reset — «Забыл пароль»: the reset code.
 *   payments       — starting a payment (signed-in callers).
 */
export const BOT_CHECK_GROUPS = [
  'sms',
  'login',
  'password_reset',
  'payments',
] as const;
export type BotCheckGroup = (typeof BOT_CHECK_GROUPS)[number];

/** Where a request came from (the app's `X-Platform`), for the per-platform
 * pass rate: one platform failing never hides behind the others. */
export type BotCheckPlatform = 'ios' | 'android' | 'web' | 'other';

export function platformOf(raw: string | undefined): BotCheckPlatform {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'ios' || v === 'android' || v === 'web' ? v : 'other';
}

/** One proven-real request: did it carry a proof that checked out, and was
 * its App Check token a limited-use one (replay protection readiness). */
export interface BotCheckSample {
  pass: boolean;
  limited: boolean;
  platform: BotCheckPlatform;
}

export interface BotCheckCounts {
  total: number;
  pass: number;
  /** Valid App Check tokens that the app marked as limited-use. */
  limited: number;
  /** Valid App Check tokens (the base of the limited-use share). */
  valid: number;
  byPlatform: Partial<
    Record<BotCheckPlatform, { total: number; pass: number }>
  >;
}

const KEY_PREFIX = 'botcheck:stats';
const PENDING_PREFIX = 'botcheck:pending';
/** Daily buckets live a little longer than the longest window (90 days). */
const BUCKET_TTL_SECONDS = 95 * 24 * 3600;
/** A code is good for 10 minutes; the pending verdict waits a bit longer. */
export const PENDING_TTL_SECONDS = 15 * 60;
/** Auto re-reads the counts at most this often per group and window. */
const MEMO_MS = 60_000;
const MAX_DAYS = 90;

/** UTC day of [at] as yyyymmdd. */
export function dayKey(at: Date): string {
  return at.toISOString().slice(0, 10).replace(/-/g, '');
}

export function emptyCounts(): BotCheckCounts {
  return { total: 0, pass: 0, limited: 0, valid: 0, byPlatform: {} };
}

/** Adds one Redis hash of a day bucket to [into]. */
export function addBucket(
  into: BotCheckCounts,
  hash: Record<string, string>,
): BotCheckCounts {
  const n = (k: string) => {
    const v = Number(hash[k]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  into.total += n('total');
  into.pass += n('pass');
  into.limited += n('limited');
  into.valid += n('valid');
  for (const p of ['ios', 'android', 'web', 'other'] as const) {
    const t = n(`total:${p}`);
    if (t === 0) continue;
    const cur = into.byPlatform[p] ?? { total: 0, pass: 0 };
    cur.total += t;
    cur.pass += n(`pass:${p}`);
    into.byPlatform[p] = cur;
  }
  return into;
}

/**
 * The «Авто» rule (owner 2026-11-25, Google's documented App Check rollout:
 * watch the verified share of real clients, enforce once it is high): true
 * only when, over the window, there are at least [minRequests] proven-real
 * requests, their pass share is at least [passRatePct], and the same holds
 * for every platform that alone reached [minRequests]. Too little data =
 * false (log only): Auto never locks people out on a guess.
 */
export function autoAllows(
  c: BotCheckCounts,
  passRatePct: number,
  minRequests: number,
): boolean {
  const min = Math.max(1, Math.floor(minRequests));
  if (c.total < min) return false;
  const ok = (pass: number, total: number) =>
    total > 0 && (pass * 100) / total >= passRatePct;
  if (!ok(c.pass, c.total)) return false;
  return Object.values(c.byPlatform).every(
    (p) => !p || p.total < min || ok(p.pass, p.total),
  );
}

/** Replay protection «Авто»: enough valid tokens, and the share of them the
 * app marked limited-use is at least [passRatePct] (an old build that sends
 * the cached token would otherwise be refused on its second request). */
export function autoReplayAllows(
  c: BotCheckCounts,
  passRatePct: number,
  minRequests: number,
): boolean {
  const min = Math.max(1, Math.floor(minRequests));
  return c.valid >= min && (c.limited * 100) / c.valid >= passRatePct;
}

/**
 * Counts of proven-real requests per group and UTC day in Redis (one small
 * hash per group and day, HINCRBY only, no scans): «proven real» = the
 * person finished the step a script cannot (typed the code that came by SMS,
 * the right password, a Google / Apple token, a signed-in payment). What the
 * bot check said about THAT person's request is what Auto and the admin
 * launch page read. A flood of scripted requests never lands here, so it
 * cannot drag the number down and keep enforcement off.
 * Never throws: counting must not break a sign-in.
 */
@Injectable()
export class BotCheckStatsService {
  private readonly memo = new Map<string, { at: number; c: BotCheckCounts }>();

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async record(
    group: BotCheckGroup,
    s: BotCheckSample & { valid?: boolean },
    at: Date = new Date(),
  ): Promise<void> {
    if (!this.redis) return;
    const key = `${KEY_PREFIX}:${group}:${dayKey(at)}`;
    try {
      const ops: Promise<unknown>[] = [
        this.redis.hincrby(key, 'total', 1),
        this.redis.hincrby(key, `total:${s.platform}`, 1),
      ];
      if (s.pass) {
        ops.push(this.redis.hincrby(key, 'pass', 1));
        ops.push(this.redis.hincrby(key, `pass:${s.platform}`, 1));
      }
      if (s.valid) ops.push(this.redis.hincrby(key, 'valid', 1));
      if (s.valid && s.limited) ops.push(this.redis.hincrby(key, 'limited', 1));
      ops.push(this.redis.expire(key, BUCKET_TTL_SECONDS));
      await Promise.all(ops);
    } catch {
      // best effort
    }
  }

  /** Sums the last [days] UTC days (today included). */
  async counts(
    group: BotCheckGroup,
    days: number,
    now: Date = new Date(),
  ): Promise<BotCheckCounts> {
    const n = Math.min(MAX_DAYS, Math.max(1, Math.floor(days)));
    const memoKey = `${group}:${n}`;
    const hit = this.memo.get(memoKey);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.c;
    const out = emptyCounts();
    if (!this.redis) return out;
    try {
      const hashes = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          this.redis!.hgetall(
            `${KEY_PREFIX}:${group}:${dayKey(new Date(now.getTime() - i * 86_400_000))}`,
          ),
        ),
      );
      for (const h of hashes) addBucket(out, h ?? {});
    } catch {
      return out;
    }
    this.memo.set(memoKey, { at: Date.now(), c: out });
    return out;
  }

  /** The verdict of a code request, kept until the code is typed (or 15
   * minutes): the code check then counts it as a proven-real sample. */
  async rememberPending(
    group: BotCheckGroup,
    identifier: string,
    s: BotCheckSample & { valid?: boolean },
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(
        pendingKey(group, identifier),
        JSON.stringify(s),
        'EX',
        PENDING_TTL_SECONDS,
      );
    } catch {
      // best effort
    }
  }

  /** Reads and deletes the pending verdict (counted once). */
  async takePending(
    group: BotCheckGroup,
    identifier: string,
  ): Promise<(BotCheckSample & { valid?: boolean }) | null> {
    if (!this.redis) return null;
    try {
      const key = pendingKey(group, identifier);
      const raw = await this.redis.getdel(key);
      if (!raw) return null;
      const v = JSON.parse(raw) as Partial<BotCheckSample & { valid: boolean }>;
      return {
        pass: v.pass === true,
        limited: v.limited === true,
        valid: v.valid === true,
        platform: platformOf(typeof v.platform === 'string' ? v.platform : ''),
      };
    } catch {
      return null;
    }
  }
}

/** The account a code / reset was asked for, hashed (no phone number or
 * e-mail in Redis keys). Phone keeps its text, e-mail is lower case — the
 * way the auth services write identifiers. */
export function pendingKey(group: BotCheckGroup, identifier: string): string {
  const v = identifier.trim();
  const norm = v.startsWith('+') ? v : v.toLowerCase();
  const h = createHash('sha256').update(norm).digest('base64url').slice(0, 32);
  return `${PENDING_PREFIX}:${group}:${h}`;
}

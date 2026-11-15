import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import {
  JobStoppedError,
  abortReason,
  runWithJobSignal,
} from '../common/queues/job-signal';
import { RELEASE, RENEW } from './handlers/job-lock';

/**
 * Batch D (14.11): one cron run under its per-name lock, stopped when it
 * must not go on.
 *
 * Before: `withJobLock` noticed a lost lock (Redis restart, failover: the
 * key is gone, the renewal finds nothing) and returned at once, but the run
 * itself went on — the BullMQ job "completed" with «previous run still
 * active», the lock was free, and the next tick started a second copy next
 * to the first. Same when BullMQ's own job lock was lost
 * (`lockRenewalFailed`). And no run had a time limit, so one hung job held
 * its whole one-at-a-time lane.
 *
 * Now (BullMQ "Cancelling jobs": an AbortSignal the work checks) one signal
 * is aborted by whichever comes first — our lock lost, BullMQ's signal
 * (worker.cancelJob on lockRenewalFailed), the time limit — and:
 *  - the run's next database call throws (`jobStopExtension`), so the old
 *    copy stops instead of racing the new one;
 *  - this function returns at once with [JobStoppedError], freeing the lane;
 *  - the lock is no longer renewed: it expires within its TTL even if the
 *    stopped run hangs outside the database, and is released (only if
 *    still ours) as soon as the run settles.
 */
export async function runUnderLock<T>(opts: {
  redis?: Redis;
  key: string;
  ttlMs: number;
  /** null = no time limit. */
  timeLimitMs: number | null;
  /** BullMQ's per-job signal (worker.cancelJob, lock renewal failed). */
  outer?: AbortSignal;
  fn: () => Promise<T>;
}): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const { redis, key, ttlMs } = opts;
  const token = randomUUID();
  if (redis && (await redis.set(key, token, 'PX', ttlMs, 'NX')) !== 'OK') {
    return { acquired: false };
  }
  const stop = new AbortController();
  const abort = (reason: string) => {
    if (!stop.signal.aborted) stop.abort(new JobStoppedError(reason));
  };
  const renew = redis
    ? setInterval(
        () => {
          void redis
            .eval(RENEW, 1, key, token, ttlMs)
            .then((kept) => {
              if (Number(kept) === 0) abort('lock lost');
            })
            // A Redis error is not a loss: the next renewal retries, the
            // TTL still bounds it.
            .catch(() => undefined);
        },
        Math.max(1, Math.floor(ttlMs / 3)),
      )
    : undefined;
  renew?.unref();
  const onOuter = () => abort(abortReason(opts.outer!));
  if (opts.outer?.aborted) onOuter();
  opts.outer?.addEventListener('abort', onOuter, { once: true });
  const limit =
    opts.timeLimitMs !== null && opts.timeLimitMs > 0
      ? setTimeout(
          () =>
            abort(`time limit ${Math.round(opts.timeLimitMs! / 60_000)} min`),
          opts.timeLimitMs,
        )
      : undefined;
  limit?.unref();

  const { work, release } = runWithJobSignal(stop.signal, opts.fn);
  let settled = false;
  const tracked = work.finally(() => {
    settled = true;
  });
  tracked.catch(() => undefined);
  const stopped = new Promise<never>((_, reject) => {
    const fail = () => reject(stop.signal.reason as Error);
    if (stop.signal.aborted) fail();
    else stop.signal.addEventListener('abort', fail, { once: true });
  });
  // Unhandled rejection guard: `stopped` may never be awaited after a win.
  stopped.catch(() => undefined);

  const unlock = async () => {
    release();
    if (redis) await redis.eval(RELEASE, 1, key, token).catch(() => undefined);
  };
  try {
    const value = await Promise.race([tracked, stopped]);
    return { acquired: true, value };
  } finally {
    if (renew) clearInterval(renew);
    if (limit) clearTimeout(limit);
    opts.outer?.removeEventListener('abort', onOuter);
    if (settled) {
      await unlock();
    } else {
      // Stopped while still running: keep the scope (its next query
      // throws), free the lock once it settles; the TTL frees it otherwise.
      void tracked.then(unlock, unlock);
    }
  }
}

// ---------------------------------------------------------------------------
// Last good run per job (status probes) and the auto time limit.

/** Redis hash: field = job name, value = JSON [CronRunRecord]. */
export const CRON_RUNS_KEY = 'ops:cron:runs';

export interface CronRunRecord {
  /** First run attempt seen (ms): the age of a job that never ran well. */
  firstAt: number;
  /** End of the last good run (ms). */
  lastOkAt?: number;
  /** Durations of the last good runs, newest first (ms). */
  okMs: number[];
}

function parse(raw: string | null | undefined): CronRunRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<CronRunRecord>;
    if (typeof r.firstAt !== 'number') return null;
    return {
      firstAt: r.firstAt,
      lastOkAt: typeof r.lastOkAt === 'number' ? r.lastOkAt : undefined,
      okMs: Array.isArray(r.okMs)
        ? r.okMs.filter((x): x is number => typeof x === 'number')
        : [],
    };
  } catch {
    return null;
  }
}

/** Reads / writes [CRON_RUNS_KEY]. One job name runs once at a time (its
 * lock), so read-modify-write of its own field does not race itself. */
export class CronRunStats {
  constructor(private readonly redis: Redis) {}

  async get(name: string): Promise<CronRunRecord | null> {
    return parse(await this.redis.hget(CRON_RUNS_KEY, name));
  }

  async all(): Promise<Record<string, CronRunRecord>> {
    const raw = await this.redis.hgetall(CRON_RUNS_KEY);
    const out: Record<string, CronRunRecord> = {};
    for (const [name, value] of Object.entries(raw ?? {})) {
      const r = parse(value);
      if (r) out[name] = r;
    }
    return out;
  }

  /** A run starts: remember when this job was first tried. */
  async attempt(name: string, now: number): Promise<void> {
    await this.redis.hsetnx(
      CRON_RUNS_KEY,
      name,
      JSON.stringify({ firstAt: now, okMs: [] } satisfies CronRunRecord),
    );
  }

  /** A good run ended after [ms]; keeps the newest [keep] durations. */
  async success(
    name: string,
    ms: number,
    now: number,
    keep: number,
  ): Promise<void> {
    const prev = await this.get(name);
    const next: CronRunRecord = {
      firstAt: prev?.firstAt ?? now,
      lastOkAt: now,
      okMs: [Math.max(0, Math.round(ms)), ...(prev?.okMs ?? [])].slice(
        0,
        Math.max(1, keep),
      ),
    };
    await this.redis.hset(CRON_RUNS_KEY, name, JSON.stringify(next));
  }
}

/** `feed.reco=30, legal.exports=10` → minutes per job (bad parts ignored). */
export function parseTimeoutList(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of raw.split(',')) {
    const m = /^\s*([a-z0-9.-]+)\s*=\s*(\d+)\s*$/.exec(part);
    if (m && Number(m[2]) > 0) out.set(m[1], Number(m[2]));
  }
  return out;
}

export interface TimeLimitSettings {
  mode: string;
  factor: number;
  minMinutes: number;
  list: string;
}

/**
 * The time limit of one run of [name] in ms, or null for none. off: none.
 * on: the listed minutes, else auto. auto: factor × the longest recent good
 * run, at least minMinutes; none while the job has no good run yet — a job
 * that works is never cut.
 */
export function timeLimitMs(
  name: string,
  s: TimeLimitSettings,
  history: readonly number[],
): number | null {
  if (s.mode === 'off') return null;
  if (s.mode === 'on') {
    const fixed = parseTimeoutList(s.list).get(name);
    if (fixed) return fixed * 60_000;
  }
  if (history.length === 0) return null;
  const longest = Math.max(...history);
  return Math.max(
    Math.max(1, s.minMinutes) * 60_000,
    Math.max(1, s.factor) * longest,
  );
}

/**
 * The period of a 5-field cron pattern (UTC) in ms, for the «no good run
 * for N periods» alarm. Covers the shapes of CRON_SCHEDULES (cron-lanes
 * spec checks every one): `*` / `* /n` / `a-b/n` / a list of minutes with
 * any hour, fixed minute hourly, daily, weekly, monthly.
 */
export function cronPeriodMs(pattern: string): number {
  const [minute = '*', hour = '*', dom = '*', , dow = '*'] = pattern
    .trim()
    .split(/\s+/);
  const MIN = 60_000;
  if (dom !== '*') return 31 * 24 * 60 * MIN;
  if (dow !== '*') return 7 * 24 * 60 * MIN;
  if (hour !== '*') return 24 * 60 * MIN;
  const step = /\/(\d+)$/.exec(minute);
  if (step) return Number(step[1]) * MIN;
  if (minute === '*') return MIN;
  const list = minute.split(',');
  if (list.length > 1) return Math.ceil(60 / list.length) * MIN;
  return 60 * MIN;
}

export interface StaleJob {
  job: string;
  /** Last good run (ISO) or null if it never ran well since first tried. */
  lastOkAt: string | null;
  ageSec: number;
  periodSec: number;
}

/** Jobs whose last good run (or first attempt, if none) is older than
 * [periods] × their period. periods ≤ 0 = check off. */
export function staleJobs(
  records: Record<string, CronRunRecord>,
  schedules: readonly { name: string; pattern: string }[],
  now: number,
  periods: number,
): StaleJob[] {
  if (!(periods > 0)) return [];
  const out: StaleJob[] = [];
  for (const s of schedules) {
    const r = records[s.name];
    if (!r) continue;
    const since = r.lastOkAt ?? r.firstAt;
    const period = cronPeriodMs(s.pattern);
    const age = now - since;
    if (age > periods * period) {
      out.push({
        job: s.name,
        lastOkAt: r.lastOkAt ? new Date(r.lastOkAt).toISOString() : null,
        ageSec: Math.floor(age / 1000),
        periodSec: Math.floor(period / 1000),
      });
    }
  }
  return out.sort((a, b) => b.ageSec - a.ageSec);
}

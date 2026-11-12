import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { stringify as stableStringify } from 'safe-stable-stringify';

/**
 * Owner 2026-10-22 (client economy plan, package D): a "cheap ETag" is
 * computed from a few indexed columns (`updated_at`, counters, a version)
 * BEFORE the handler builds its answer. When the phone's `If-None-Match`
 * carries the same tag the handler returns nothing and the response goes
 * out as 304 — no further queries, no body. Express's own body ETag is
 * skipped because the header is already set (it only tags untagged
 * answers), so the tag the client sees is this one on both paths.
 */
export function weakEtag(
  ...parts: (string | number | Date | null | undefined)[]
): string {
  const token = parts
    .map((p) => (p instanceof Date ? String(p.getTime()) : String(p ?? '')))
    .join('-')
    .replace(/["\\\s]/g, '_');
  return `W/"${token}"`;
}

/** True when the request carries an If-None-Match matching [etag]. */
export function etagMatches(
  ifNoneMatch: string | string[] | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  const raw = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch;
  if (raw.trim() === '*') return true;
  const strong = etag.replace(/^W\//, '');
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .some((t) => t === strong);
}

/**
 * Sets the ETag header and, when the client already has this version,
 * switches the response to 304 and returns true — the caller then returns
 * without building the body (`return undefined`).
 */
export function notModified(
  req: Pick<Request, 'headers'>,
  res: Pick<Response, 'setHeader' | 'status'>,
  etag: string,
): boolean {
  res.setHeader('ETag', etag);
  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.status(304);
    return true;
  }
  return false;
}

/**
 * Conditional GET for a version-stamp tag (VersionEtagService). On a match
 * `verify` runs (access / ownership checks and side effects the normal
 * path has, e.g. an "opened" ping) and the answer is a 304; otherwise
 * `build` makes the body and the same tag goes on it. A null tag means
 * "no cheap tag": just build.
 */
export async function conditionalGet<T>(
  req: Pick<Request, 'headers'>,
  res: Pick<Response, 'setHeader' | 'status'>,
  tag: string | null,
  verify: () => Promise<void>,
  build: () => Promise<T>,
): Promise<T | undefined> {
  if (tag && etagMatches(req.headers['if-none-match'], tag)) {
    await verify();
    res.setHeader('ETag', tag);
    res.status(304);
    return undefined;
  }
  const body = await build();
  if (tag) res.setHeader('ETag', tag);
  return body;
}

/**
 * 12.11 (prod: /admin/system-health, /admin/spend/registry, /admin/infra,
 * /admin/launch never answered 304): the ETag of an admin BOARD from what
 * it means, not from its bytes. Every rebuild stamps the time of the check
 * (`generatedAt`, each registry row's `checkedAt`) and fresh measurements
 * (`latencyMs`, `lastBeatSec`, `uptimeSec` …), so Express's body hash moved
 * on every rebuild although no light or number the admin acts on changed.
 * The tag hashes the body with [volatile] keys left out, object keys sorted
 * (safe-stable-stringify, MIT) and a [bucketMs] time bucket, so a skipped
 * measurement is at most one bucket old in the browser. A weak tag
 * (RFC 9110 §8.8.1: "semantically equivalent") is exactly that promise.
 */
export function stableEtag(
  value: unknown,
  volatile: ReadonlySet<string>,
  bucketMs: number,
  now: number = Date.now(),
): string {
  const text =
    stableStringify(value, (key, v: unknown) =>
      volatile.has(key) ? undefined : v,
    ) ?? '';
  const hash = createHash('sha1').update(text).digest('base64url');
  return weakEtag('s', hash, timeBucket(bucketMs, now));
}

/** Keys of an admin board that change on every rebuild without changing
 * what the admin acts on (the lights carry the thresholds): times of the
 * check and raw measurements. Listed by name across system-health,
 * status-probes, the cost registry and the launch checklist. */
export const BOARD_VOLATILE_KEYS: ReadonlySet<string> = new Set([
  'generatedAt',
  'checkedAt',
  'lastProbeAt',
  'bloatCheckedAt',
  'latencyMs',
  'r2LatencyMs',
  'answerMs',
  'connectMs',
  'p95Ms',
  'p95Ms1h',
  'lastBeatSec',
  'uptimeSec',
  'memoryMb',
  'usedMb',
  'usedPct',
  'oldestSec',
  'slowOldestSec',
  'queueOldestSec',
  'lagSec',
  'ageHours',
]);

/** A skipped measurement is at most this old in the browser. */
export const BOARD_ETAG_BUCKET_MS = 5 * 60_000;

/** {@link stableEtag} with the board defaults. */
export function boardEtag(value: unknown, now: number = Date.now()): string {
  return stableEtag(value, BOARD_VOLATILE_KEYS, BOARD_ETAG_BUCKET_MS, now);
}

/** A time bucket: put it in a tag so a 304 can never outlive [ms] (covers
 * inputs the tag does not read: admin settings, presigned URLs). */
export function timeBucket(ms: number, now: number = Date.now()): number {
  return Math.floor(now / ms);
}

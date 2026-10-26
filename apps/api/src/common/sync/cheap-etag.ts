import type { Request, Response } from 'express';

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

/** A time bucket: put it in a tag so a 304 can never outlive [ms] (covers
 * inputs the tag does not read: admin settings, presigned URLs). */
export function timeBucket(ms: number, now: number = Date.now()): number {
  return Math.floor(now / ms);
}

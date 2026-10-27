/**
 * Owner 2026-10-25 (privacy round 13, S13-4/S13-10): a small seam for "this
 * object must leave the CDN edge now" (a file deleted for everyone, an
 * erased person's avatar). The real implementation (CloudFront
 * `CreateInvalidation` / Cloudflare purge queue, batched, behind a switch)
 * belongs to the caching work; callers inject this token `@Optional()` and
 * simply skip the call while nothing is bound, so deleting never depends on
 * a CDN. Paths are object keys / URL paths without the host.
 */
export const CDN_INVALIDATOR = Symbol('CDN_INVALIDATOR');

export interface CdnInvalidator {
  /** Queues the invalidation; must not throw for an unknown path. */
  enqueue(paths: string[], reason: string): Promise<void>;
}

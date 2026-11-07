import type Redis from 'ioredis';
import { timeBucket, weakEtag } from '../../../common/sync/cheap-etag';

/**
 * Owner 2026-10-22 (client economy plan, package D): one counter that
 * moves whenever the flags, app_config, languages or legal documents
 * change (every invalidation path bumps it). GET /config/bootstrap and
 * GET /me/session put it into their cheap ETag, so an unchanged config
 * answers 304 without building the body.
 */
export const CONFIG_VERSION_KEY = 'config:version';

export async function bumpConfigVersion(redis: Redis): Promise<void> {
  try {
    await redis.incr(CONFIG_VERSION_KEY);
  } catch {
    // best-effort: a missed bump is covered by the ETag's time bucket
  }
}

export async function readConfigVersion(redis: Redis): Promise<string> {
  try {
    return (await redis.get(CONFIG_VERSION_KEY)) ?? '0';
  } catch {
    return '0';
  }
}

/** How long a config-versioned tag lives at most (inputs that bypass the
 * version, e.g. a language added by an import on another instance). */
export const CONFIG_TAG_BUCKET_MS = 5 * 60_000;

/**
 * Owner 2026-11-04 (R-385): the cheap ETag of a reference answer that
 * changes only with the config version (languages, legal documents):
 * one Redis GET, and a matching If-None-Match is a 304 before any query.
 */
export async function configTag(
  redis: Redis,
  ...parts: (string | number | null | undefined)[]
): Promise<string> {
  return weakEtag(
    ...parts,
    await readConfigVersion(redis),
    timeBucket(CONFIG_TAG_BUCKET_MS),
  );
}

import type Redis from 'ioredis';

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

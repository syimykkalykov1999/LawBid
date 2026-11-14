import { SetMetadata } from '@nestjs/common';
import type { AppSettingKey } from '../common/app-settings/app-settings.defaults';
import { callPollKey, verifyCallPoll } from '../common/calls/call-poll-token';

/** Metadata key of [ThrottleSetting]. */
export const THROTTLE_SETTING = 'lawbid:throttle-setting';

/**
 * Owner 13.11 (no hard-coded limits): the route's `@Throttle` limit is read
 * live from this admin setting by UserThrottlerGuard (0 = no limit); the
 * number written in `@Throttle` is only the fallback when the setting
 * cannot be read.
 */
export const ThrottleSetting = (key: AppSettingKey) =>
  SetMetadata(THROTTLE_SETTING, key);

let cachedKey: { pepper: string; key: Buffer } | undefined;

/**
 * D1-19 (13.11): the ring-status routes are called without a session, so
 * the default tracker counted them per IP — three ringing phones behind one
 * office Wi-Fi or carrier NAT used up one shared bucket. A valid ring
 * ticket (`t`, signed by the server for one call and one person) is counted
 * per call and person instead; anything else stays per IP. The ticket is
 * only an HMAC check here (no database), the same one the route does.
 */
export function ringTicketTracker(
  req: Record<string, unknown>,
): Promise<string> {
  const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
  const params = req.params as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown> | undefined;
  const body = req.body as Record<string, unknown> | undefined;
  const id = params?.id;
  const t = query?.t ?? body?.t;
  const pepper = process.env.AUTH_EVENT_PEPPER;
  if (typeof id === 'string' && typeof t === 'string' && pepper) {
    if (cachedKey?.pepper !== pepper) {
      cachedKey = { pepper, key: callPollKey(pepper) };
    }
    const claims = verifyCallPoll(cachedKey.key, t, id);
    if (claims) return Promise.resolve(`ring:${claims.c}:${claims.u}`);
  }
  return Promise.resolve(`ip:${ip}`);
}

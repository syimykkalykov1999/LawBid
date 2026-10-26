import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Owner 2026-10-26 (pushes like WhatsApp): the «Ответить» / «Прочитано»
 * buttons of a chat notification work without opening the app. The phone
 * cannot use the user's session from a notification button (the app may
 * be closed; a second refresh from outside the app would rotate the
 * session under it), so every chat push carries a small signed ticket:
 * WHO (the recipient), WHICH chat, until WHEN. The button sends it back
 * with the device's own FCM token; the server accepts it only while that
 * device is still signed in to that account (push-actions.service).
 *
 * `v1.<payload>.<mac>` — base64url JSON + HMAC-SHA256 under a key derived
 * from AUTH_EVENT_PEPPER (domain-separated: no other code signs with it).
 * Not secret content (ids only) but unforgeable and short-lived.
 */
export interface PushActionClaims {
  /** The recipient (the account the button acts for). */
  u: string;
  /** The conversation (1:1) or group id. */
  c: string;
  /** 1 = a group chat. */
  g: 0 | 1;
  /** Expiry, unix seconds. */
  e: number;
}

/** How long a notification's buttons work (WhatsApp-like: a day or two). */
export const PUSH_ACTION_TTL_SEC = 48 * 3600;

export function pushActionKey(pepper: string): Buffer {
  return createHmac('sha256', pepper).update('lawbid:push-action:v1').digest();
}

function mac(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function signPushAction(
  key: Buffer,
  claims: Omit<PushActionClaims, 'e'>,
  nowMs: number = Date.now(),
): string {
  const full: PushActionClaims = {
    ...claims,
    e: Math.floor(nowMs / 1000) + PUSH_ACTION_TTL_SEC,
  };
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `v1.${payload}.${mac(key, payload)}`;
}

/** The claims of a valid, unexpired ticket; null for anything else. */
export function verifyPushAction(
  key: Buffer,
  token: string,
  nowMs: number = Date.now(),
): PushActionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, payload, given] = parts;
  const want = Buffer.from(mac(key, payload));
  const got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let claims: PushActionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as PushActionClaims;
  } catch {
    return null;
  }
  if (
    typeof claims.u !== 'string' ||
    typeof claims.c !== 'string' ||
    (claims.g !== 0 && claims.g !== 1) ||
    typeof claims.e !== 'number' ||
    claims.e * 1000 < nowMs
  ) {
    return null;
  }
  return claims;
}

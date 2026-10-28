import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Owner 2026-10-28 (a locked Samsung kept ringing after the caller hung
 * up): the phone that rings asks «is this call still ringing?» while the
 * app is asleep — from the native side, with no session (the app may be
 * closed, its access token gone or not loaded yet). The ring push carries
 * this small signed ticket: WHICH call, for WHOM, until WHEN.
 * `GET /calls/:id/status?t=<ticket>` answers only the call's state
 * (ringing / active / ended) — nothing else about the call or the person.
 *
 * `cp1.<payload>.<mac>` — base64url JSON + HMAC-SHA256 under a key derived
 * from AUTH_EVENT_PEPPER (domain-separated from every other ticket).
 */
export interface CallPollClaims {
  /** The call. */
  c: string;
  /** The recipient (the account that is rung). */
  u: string;
  /** Expiry, unix seconds. */
  e: number;
}

/** Longer than any ring (the app 60 s, the server 65 s), short after. */
export const CALL_POLL_TTL_SEC = 180;

export function callPollKey(pepper: string): Buffer {
  return createHmac('sha256', pepper).update('lawbid:call-poll:v1').digest();
}

function mac(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function signCallPoll(
  key: Buffer,
  claims: Omit<CallPollClaims, 'e'>,
  nowMs: number = Date.now(),
): string {
  const full: CallPollClaims = {
    ...claims,
    e: Math.floor(nowMs / 1000) + CALL_POLL_TTL_SEC,
  };
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `cp1.${payload}.${mac(key, payload)}`;
}

/** The claims of a valid, unexpired ticket for [callId]; null otherwise. */
export function verifyCallPoll(
  key: Buffer,
  token: string,
  callId: string,
  nowMs: number = Date.now(),
): CallPollClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'cp1') return null;
  const [, payload, given] = parts;
  const want = Buffer.from(mac(key, payload));
  const got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let claims: CallPollClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as CallPollClaims;
  } catch {
    return null;
  }
  if (
    typeof claims.c !== 'string' ||
    typeof claims.u !== 'string' ||
    typeof claims.e !== 'number' ||
    claims.c !== callId ||
    claims.e * 1000 < nowMs
  ) {
    return null;
  }
  return claims;
}

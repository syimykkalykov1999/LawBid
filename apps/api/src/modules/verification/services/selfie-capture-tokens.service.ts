import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { httpError } from '../verification.helpers';

/** How long a capture token is valid (the camera opens right after). */
export const SELFIE_CAPTURE_TOKEN_TTL_SEC = 1_800;

/** Kept this long after expiry so a late upload says "expired", not
 * "invalid". */
const EXPIRED_GRACE_SEC = 3_600;

const KEY_PREFIX = 'verif:selfie_cap:';

export type SelfieCaptureTokenError =
  'capture_token_missing' | 'capture_token_invalid' | 'capture_token_expired';

/** What the server knows about a capture after the token was spent. */
export interface SelfieCaptureGrant {
  issuedAt: string;
  usedAt: string;
}

interface StoredToken {
  u: string;
  r: string;
  iat: number;
  exp: number;
}

function keyOf(token: string): string {
  // Only a hash is stored: a Redis dump never holds a usable token.
  return KEY_PREFIX + createHash('sha256').update(token).digest('hex');
}

function reject(reason: SelfieCaptureTokenError): never {
  const message =
    reason === 'capture_token_missing'
      ? 'Take the selfie with the in-app camera.'
      : reason === 'capture_token_expired'
        ? 'The selfie capture session expired. Take the selfie again.'
        : 'The selfie capture session is not valid. Take the selfie again.';
  throw httpError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, message, {
    field: 'captureToken',
    reason,
  });
}

/**
 * Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md): a
 * one-time token the app asks for right before it opens the guided selfie
 * camera. Bound to the attorney and the verification request, valid
 * [SELFIE_CAPTURE_TOKEN_TTL_SEC], spent by the selfie attach (GETDEL, so
 * two uploads can't share it). It does not prove the picture is live — a
 * modified app could still send any file — it closes the plain "upload a
 * gallery / AI picture" path and ties the capture metadata to a session.
 * Redis down → no token can be spent (fails closed; the admin switch
 * `verification.selfie_live_capture_required` turns the rule off).
 */
@Injectable()
export class SelfieCaptureTokensService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async issue(
    userId: string,
    requestId: string,
    now = Date.now(),
  ): Promise<{ token: string; expiresAt: string }> {
    const token = randomBytes(24).toString('base64url');
    const exp = now + SELFIE_CAPTURE_TOKEN_TTL_SEC * 1000;
    const value: StoredToken = { u: userId, r: requestId, iat: now, exp };
    await this.redis.set(
      keyOf(token),
      JSON.stringify(value),
      'EX',
      SELFIE_CAPTURE_TOKEN_TTL_SEC + EXPIRED_GRACE_SEC,
    );
    return { token, expiresAt: new Date(exp).toISOString() };
  }

  /** Spends the token or throws 400 VALIDATION_ERROR with
   * `details.reason` (missing / invalid — unknown, used, someone else's —
   * / expired). */
  async consume(
    userId: string,
    requestId: string,
    token: string | undefined,
    now = Date.now(),
  ): Promise<SelfieCaptureGrant> {
    if (!token) reject('capture_token_missing');
    const raw = await this.redis.getdel(keyOf(token));
    if (!raw) reject('capture_token_invalid');
    let stored: StoredToken;
    try {
      stored = JSON.parse(raw) as StoredToken;
    } catch {
      reject('capture_token_invalid');
    }
    if (stored.u !== userId || stored.r !== requestId) {
      reject('capture_token_invalid');
    }
    if (!(stored.exp > now)) reject('capture_token_expired');
    return {
      issuedAt: new Date(stored.iat).toISOString(),
      usedAt: new Date(now).toISOString(),
    };
  }

  /** Puts a spent token back when the attach that spent it failed for
   * another reason (the attorney retries without a new capture). */
  async restore(
    userId: string,
    requestId: string,
    token: string,
    grant: SelfieCaptureGrant,
    now = Date.now(),
  ): Promise<void> {
    const iat = Date.parse(grant.issuedAt);
    const exp = iat + SELFIE_CAPTURE_TOKEN_TTL_SEC * 1000;
    const left = Math.ceil((exp - now) / 1000);
    if (left <= 0) return;
    const value: StoredToken = { u: userId, r: requestId, iat, exp };
    await this.redis.set(
      keyOf(token),
      JSON.stringify(value),
      'EX',
      left + EXPIRED_GRACE_SEC,
      'NX',
    );
  }
}

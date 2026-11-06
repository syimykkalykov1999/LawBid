import { createHash, randomBytes } from 'node:crypto';
import {
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { DEFAULT_PUBLIC_ORIGIN } from '../../../common/utils/public-urls';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import {
  AUTH_EVENT_TYPES,
  AuthEventService,
  RateLimitService,
} from '../../auth/auth.public';
import { httpError } from '../verification.helpers';

/** R-146: how long the QR / link on the computer stays valid. */
export const HANDOFF_TTL_SEC = 600;

/** Kept this long after expiry so the computer and the phone read
 * "expired", not "unknown". */
const EXPIRED_GRACE_SEC = 3_600;

/** Codes one attorney may make per hour (each «Обновить QR» is one). */
export const HANDOFF_CREATE_LIMIT = 20;
const HANDOFF_CREATE_WINDOW_SEC = 3_600;

/** The link path the app opens (AndroidManifest, apple-app-site-association,
 * parseDeepLink in the app). Not `/v/`: that is the web app's versioned
 * release files (infra/modules/web, `/v/<sha>/…`). */
export const HANDOFF_LINK_PATH = '/selfie/';

const KEY_PREFIX = 'verif:handoff:';
/** requestId → hash of the newest open handoff, so a selfie attached by
 * the phone marks it done even when the phone did not send the token. */
const REQUEST_KEY_PREFIX = 'verif:handoff:req:';

export type HandoffStatus = 'pending' | 'done' | 'expired';

interface StoredHandoff {
  u: string;
  r: string;
  iat: number;
  exp: number;
  /** When the selfie arrived (ms), absent while pending. */
  done?: number;
}

function hashOf(token: string): string {
  // Only a hash is stored: a Redis dump never holds a usable link.
  return createHash('sha256').update(token).digest('hex');
}

/**
 * R-146 (owner 2026-10-24, confirmed 2026-11-04): «continue on your phone»
 * for the ID selfie when the computer has no camera — the cross-device
 * handoff of Stripe Identity / Onfido: the computer shows a QR code and a
 * short link carrying a one-time token (10 min) bound to the attorney and
 * the open verification request; the phone (signed in to the same account)
 * opens the selfie step of THAT request and attaches the selfie through the
 * usual endpoint; the computer polls the cheap status until `done` or
 * `expired`. Redis only — no table, nothing to clean up.
 */
@Injectable()
export class VerificationHandoffService {
  private readonly origin: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly rateLimit: RateLimitService,
    private readonly authEvents: AuthEventService,
    config: ConfigService,
  ) {
    this.origin = (
      config.get<string>('APP_LINK_BASE_URL') || DEFAULT_PUBLIC_ORIGIN
    ).replace(/\/+$/, '');
  }

  /** The caller has already checked that [requestId] is the attorney's
   * own editable request. */
  async create(
    userId: string,
    requestId: string,
    ip?: string,
    now = Date.now(),
  ): Promise<{ token: string; url: string; expiresAt: string }> {
    const limit = await this.rateLimit.consumeFixedWindow(
      ['verif-handoff', userId],
      HANDOFF_CREATE_LIMIT,
      HANDOFF_CREATE_WINDOW_SEC,
    );
    if (!limit.allowed) {
      throw httpError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many codes. Try again later.',
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }
    // 16 random bytes → 22 base64url characters: short enough to type.
    const token = randomBytes(16).toString('base64url');
    const exp = now + HANDOFF_TTL_SEC * 1000;
    const value: StoredHandoff = { u: userId, r: requestId, iat: now, exp };
    const keep = HANDOFF_TTL_SEC + EXPIRED_GRACE_SEC;
    await this.redis
      .multi()
      .set(KEY_PREFIX + hashOf(token), JSON.stringify(value), 'EX', keep)
      .set(REQUEST_KEY_PREFIX + requestId, hashOf(token), 'EX', keep)
      .exec();
    await this.authEvents
      .record({
        userId,
        eventType: AUTH_EVENT_TYPES.VERIFICATION_HANDOFF_CREATED,
        success: true,
        ip,
        meta: { requestId },
      })
      .catch(() => undefined);
    return {
      token,
      url: `${this.origin}${HANDOFF_LINK_PATH}${token}`,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  /** pending / done / expired for the attorney who made the code; an
   * unknown code or someone else's is a 404 (deny by default). */
  async status(
    userId: string,
    token: string,
    now = Date.now(),
  ): Promise<{ status: HandoffStatus; requestId: string; expiresAt: string }> {
    const stored = await this.read(hashOf(token));
    if (!stored || stored.u !== userId) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Handoff code not found.',
      });
    }
    const status: HandoffStatus = stored.done
      ? 'done'
      : stored.exp > now
        ? 'pending'
        : 'expired';
    return {
      status,
      requestId: stored.r,
      expiresAt: new Date(stored.exp).toISOString(),
    };
  }

  /** Throws 400 when a token the phone sent with the selfie is not a live
   * handoff of this attorney and request. */
  async assertUsable(
    userId: string,
    requestId: string,
    token: string,
    now = Date.now(),
  ): Promise<void> {
    const stored = await this.read(hashOf(token));
    const reason =
      !stored || stored.u !== userId || stored.r !== requestId
        ? 'handoff_token_invalid'
        : !(stored.exp > now) && !stored.done
          ? 'handoff_token_expired'
          : null;
    if (reason) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        reason === 'handoff_token_expired'
          ? 'The code from the computer expired. Make a new one there.'
          : 'This link is not valid for this account.',
        { field: 'handoffToken', reason },
      );
    }
  }

  /**
   * A selfie was attached to [requestId]: the open handoff of that request
   * (and [token], when the phone sent one) flips to `done`. Best effort —
   * the selfie itself is already saved.
   */
  async markDone(
    userId: string,
    requestId: string,
    token?: string,
    now = Date.now(),
  ): Promise<void> {
    const hashes = new Set<string>();
    if (token) hashes.add(hashOf(token));
    const latest = await this.redis.get(REQUEST_KEY_PREFIX + requestId);
    if (latest) hashes.add(latest);
    for (const h of hashes) {
      const stored = await this.read(h);
      if (!stored || stored.u !== userId || stored.r !== requestId) continue;
      if (stored.done) continue;
      const ttl = await this.redis.ttl(KEY_PREFIX + h);
      const value: StoredHandoff = { ...stored, done: now };
      await this.redis.set(
        KEY_PREFIX + h,
        JSON.stringify(value),
        'EX',
        ttl > 0 ? ttl : EXPIRED_GRACE_SEC,
      );
      await this.authEvents
        .record({
          userId,
          eventType: AUTH_EVENT_TYPES.VERIFICATION_HANDOFF_DONE,
          success: true,
          meta: { requestId, viaLink: token ? hashOf(token) === h : false },
        })
        .catch(() => undefined);
    }
  }

  private async read(hash: string): Promise<StoredHandoff | null> {
    const raw = await this.redis.get(KEY_PREFIX + hash);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredHandoff;
    } catch {
      return null;
    }
  }
}

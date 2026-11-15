import {
  Inject,
  Optional,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { OAuth2Client } from 'google-auth-library';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  SocialTokenVerifier,
  SocialVerifyResult,
} from './social-verifier.interface';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { nonceClaimMatches, sha256Hex } from './nonce.util';

/** Default of `auth.social_token_max_age_sec` (R2B-9). */
const DEFAULT_MAX_AGE_SEC = 600;

/**
 * docs/01_FOUNDATION_AUTH.md §10.2: "сервер валидирует подпись/аудиторию/
 * срок" — google-auth-library's verifyIdToken does exactly that against
 * Google's published JWKS (with its own internal caching/rotation), so
 * this class is a thin, typed wrapper rather than hand-rolled JWKS
 * handling (unlike Apple, which has no official Node SDK — see
 * apple-token-verifier.service.ts).
 *
 * Nonce: google-auth-library does NOT check it — nonceClaimMatches()
 * (nonce.util.ts) requires the claim and accepts the raw nonce or its
 * sha256 hex, per Google's client libraries' two conventions.
 */
@Injectable()
export class GoogleTokenVerifier implements SocialTokenVerifier {
  private readonly client: OAuth2Client;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    this.client = new OAuth2Client();
  }

  /** Owner 2026-10-01: the client ids can be changed in the admin. */
  private async audiences(): Promise<string[]> {
    const raw =
      (await this.secrets?.field('google_signin', 'clientIds')) ??
      this.config.get<string>('GOOGLE_CLIENT_IDS');
    return raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }

  async verify(idToken: string, nonce: string): Promise<SocialVerifyResult> {
    const audiences = await this.audiences();
    if (audiences.length === 0) {
      throw new ServiceUnavailableException({
        code: ErrorCode.AUTH_PROVIDER_DISABLED,
        message:
          'Google sign-in is not configured (GOOGLE_CLIENT_IDS is empty).',
      });
    }
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: audiences,
      });
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Google ID token failed verification.',
      });
    }
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Google ID token payload missing sub.',
      });
    }
    if (!nonceClaimMatches('google', payload.nonce, nonce)) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Google ID token nonce mismatch.',
      });
    }
    await this.assertFreshAndUnused(payload, nonce);
    return {
      providerUid: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      firstName: payload.given_name,
      lastName: payload.family_name,
    };
  }

  /**
   * Detective R2B-9 (14.11): a leaked ID token is not a key for an hour.
   * (1) issued no longer ago than `auth.social_token_max_age_sec` (default
   * 600 s, 0 = off); (2) its nonce works once — SET NX until the token
   * expires, the single-use nonce rule of openid-client (MIT). Without
   * Redis (tests, a Redis outage) the signature + nonce checks stand alone.
   */
  private async assertFreshAndUnused(
    payload: { iat?: number; exp?: number },
    nonce: string,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const raw = await this.settings
      ?.number('auth.social_token_max_age_sec')
      .catch(() => NaN);
    const maxAge =
      typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? raw
        : DEFAULT_MAX_AGE_SEC;
    if (
      maxAge > 0 &&
      typeof payload.iat === 'number' &&
      now - payload.iat > maxAge
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Google ID token is too old; sign in again.',
      });
    }
    if (!this.redis) return;
    const ttl = Math.max(60, (payload.exp ?? now + 3600) - now + 60);
    let first: string | null;
    try {
      first = await this.redis.set(
        `auth:social:nonce:google:${sha256Hex(nonce)}`,
        '1',
        'EX',
        ttl,
        'NX',
      );
    } catch {
      return; // Redis down: fail open, the other checks still hold.
    }
    if (first !== 'OK') {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'This Google sign-in was already used; sign in again.',
      });
    }
  }
}

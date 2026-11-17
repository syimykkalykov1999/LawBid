import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { legacyClientAllowed } from '../../../common/utils/semver.util';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { sha256Hex } from './nonce.util';

/** Default of `auth.social_nonce_ttl_sec`. */
const DEFAULT_TTL_SEC = 600;

const issuedKey = (nonce: string) => `auth:social:issued:${sha256Hex(nonce)}`;

/**
 * Detective R2B-9 (14.11): the Google sign-in nonce comes from the server,
 * the way the WebAuthn challenge of this module does (passkey.service:
 * random value in Redis with a TTL, GETDEL on use — the SimpleWebAuthn
 * pattern) and as OpenID Connect Core §3.1.2.1 intends the nonce: made by
 * the relying party and checked once. Until now the app made its own
 * nonce, so a stolen ID token came with the nonce it was minted for.
 *
 * Only a hash is kept (like `auth:social:nonce:google:*`); the raw value is
 * known to the app and Google alone.
 */
@Injectable()
export class SocialNonceService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
  ) {}

  private async ttlSeconds(): Promise<number> {
    const raw = await this.settings
      .number('auth.social_nonce_ttl_sec')
      .catch(() => NaN);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TTL_SEC;
  }

  /** A fresh 256-bit nonce for one Google sign-in. */
  async issue(): Promise<{ nonce: string; expiresAt: string }> {
    const ttl = await this.ttlSeconds();
    const nonce = randomBytes(32).toString('base64url');
    await this.redis.set(issuedKey(nonce), '1', 'EX', ttl);
    return {
      nonce,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  /**
   * Burns an issued [nonce] (GETDEL: a second use finds nothing). A nonce
   * the server never issued (or already used) is accepted only from an app
   * below `security.google_nonce_min_app_version` — empty = everyone, the
   * rule is not switched on yet, so today's app keeps signing in.
   * Redis unreachable counts as «not issued»: the same version rule decides.
   */
  async assertIssued(
    nonce: string,
    appVersion: string | undefined,
  ): Promise<void> {
    const hit = await this.redis.getdel(issuedKey(nonce)).catch(() => null);
    if (hit !== null) return;
    const minVersion = await this.settings
      .string('security.google_nonce_min_app_version')
      .catch(() => '');
    if (legacyClientAllowed(appVersion, minVersion)) return;
    throw new UnauthorizedException({
      code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
      message:
        'This sign-in nonce was not issued by the server; sign in again.',
    });
  }
}

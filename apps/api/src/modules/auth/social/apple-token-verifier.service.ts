import {
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  SocialTokenVerifier,
  SocialVerifyResult,
} from './social-verifier.interface';
import { nonceClaimMatches } from './nonce.util';

/**
 * Apple has no official Node SDK. `jose`'s createRemoteJWKSet +
 * jwtVerify against Apple's published JWKS endpoint is the standard,
 * well-maintained way to do this (handles key caching/rotation
 * internally, same as google-auth-library does for Google).
 *
 * docs/01_FOUNDATION_AUTH.md §10.2: "Apple: сохраняем sub, приватный
 * relay-email допустим, имя приходит только при первом входе (сохранить
 * сразу)" — name isn't in the id_token at all (Apple sends it once,
 * separately, in the authorization response on first login), so
 * firstName/lastName here are always undefined; the controller accepts
 * them as optional request fields for that first-login case instead.
 *
 * Nonce: iOS hashes the raw nonce before putting it in the request
 * (unlike Google, which sends it raw) — verify sha256(rawNonce) against
 * the token's nonce claim.
 */
@Injectable()
export class AppleTokenVerifier implements SocialTokenVerifier {
  private readonly jwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly secrets?: SecretsService,
  ) {}

  /** Owner 2026-10-01: the bundle ids can be changed in the admin. */
  private async bundleIds(): Promise<string[]> {
    const raw =
      (await this.secrets?.field('apple_signin', 'bundleIds')) ??
      this.config.get<string>('APPLE_BUNDLE_IDS');
    return raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }

  async verify(idToken: string, rawNonce: string): Promise<SocialVerifyResult> {
    const bundleIds = await this.bundleIds();
    if (bundleIds.length === 0) {
      throw new ServiceUnavailableException({
        code: ErrorCode.AUTH_PROVIDER_DISABLED,
        message: 'Apple sign-in is not configured (APPLE_BUNDLE_IDS is empty).',
      });
    }

    let payload;
    try {
      const result = await jwtVerify(idToken, this.jwks, {
        issuer: 'https://appleid.apple.com',
        audience: bundleIds,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Apple ID token failed verification.',
      });
    }

    if (typeof payload.sub !== 'string') {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Apple ID token payload missing sub.',
      });
    }
    if (!nonceClaimMatches('apple', payload.nonce, rawNonce)) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SOCIAL_TOKEN_INVALID,
        message: 'Apple ID token nonce mismatch.',
      });
    }

    return {
      providerUid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified:
        payload.email_verified === true || payload.email_verified === 'true',
      firstName: undefined,
      lastName: undefined,
    };
  }
}

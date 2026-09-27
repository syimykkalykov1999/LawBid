import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type {
  SocialTokenVerifier,
  SocialVerifyResult,
} from './social-verifier.interface';
import { nonceClaimMatches } from './nonce.util';

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
  private readonly audiences: string[];

  constructor(private readonly config: ConfigService) {
    this.client = new OAuth2Client();
    const raw = this.config.get<string>('GOOGLE_CLIENT_IDS');
    this.audiences = raw ? raw.split(',').map((s) => s.trim()) : [];
  }

  async verify(idToken: string, nonce: string): Promise<SocialVerifyResult> {
    if (this.audiences.length === 0) {
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
        audience: this.audiences,
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
    return {
      providerUid: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      firstName: payload.given_name,
      lastName: payload.family_name,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import { parseJwtKeys } from './jwt-keys.util';

export interface AccessTokenClaims {
  sub: string;
  // Nullable: User.role is nullable in the schema (docs/CHANGELOG.md,
  // stage 1.4 — role is chosen during onboarding, not at account
  // creation), so a freshly-created user's very first access token
  // legitimately carries role: null until onboarding step 2 completes.
  role: string | null;
  sid: string; // session_chain_id, stable across refresh rotation
  verified: boolean;
  subscriptionStatus: string;
}

export interface ReauthTokenClaims {
  sub: string;
  sid: string;
}

export class TokenVerifyExpiredError extends Error {}
export class TokenVerifyInvalidError extends Error {}

/**
 * Signs/verifies the two JWT types this stage issues (access, reauth) and
 * generates/hashes opaque refresh tokens. Deliberately NOT built on
 * @nestjs/passport + passport-jwt (see docs/CHANGELOG.md, stage 1.4): the
 * spec requires a 401 with the EXACT code TOKEN_EXPIRED for an expired
 * access token and a different code for every other 401 cause
 * (docs/01_FOUNDATION_AUTH.md §10.4 — the mobile client's dio interceptor
 * keys off that literal string). A ~40-line hand-rolled verify path makes
 * that distinction trivial; passport's error normalization would fight it.
 *
 * HS256, not RS256: this is a single monolith today, nothing else needs
 * to verify tokens independently. `JWT_KEYS` carries multiple kids so a
 * secret can rotate without invalidating tokens signed under the previous
 * one — the active kid signs, every listed kid can verify.
 */
@Injectable()
export class TokenService {
  private readonly keys: Map<string, string>;
  private readonly activeKid: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;
  private readonly reauthTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.keys = parseJwtKeys(this.config.getOrThrow<string>('JWT_KEYS'));
    this.activeKid = this.config.getOrThrow<string>('JWT_ACTIVE_KID');
    this.accessTtlSeconds = this.config.getOrThrow<number>(
      'JWT_ACCESS_TTL_SECONDS',
    );
    this.refreshTtlDays = this.config.getOrThrow<number>(
      'JWT_REFRESH_TTL_DAYS',
    );
    this.reauthTtlSeconds = this.config.getOrThrow<number>(
      'REAUTH_TOKEN_TTL_SECONDS',
    );
  }

  signAccessToken(claims: AccessTokenClaims): string {
    const secret = this.activeSecret();
    return this.jwt.sign(
      { ...claims, typ: 'access' },
      {
        secret,
        keyid: this.activeKid,
        algorithm: 'HS256',
        expiresIn: this.accessTtlSeconds,
        issuer: 'lawbid',
        audience: 'lawbid-app',
      },
    );
  }

  /** Throws TokenVerifyExpiredError / TokenVerifyInvalidError — never a raw jsonwebtoken error. */
  verifyAccessToken(token: string): AccessTokenClaims {
    const claims = this.verifyWithKeyRotation(token, 'access');
    return {
      sub: claims.sub as string,
      role: claims.role as string | null,
      sid: claims.sid as string,
      verified: claims.verified as boolean,
      subscriptionStatus: claims.subscriptionStatus as string,
    };
  }

  signReauthToken(claims: ReauthTokenClaims): string {
    const secret = this.activeSecret();
    return this.jwt.sign(
      { ...claims, typ: 'reauth' },
      {
        secret,
        keyid: this.activeKid,
        algorithm: 'HS256',
        expiresIn: this.reauthTtlSeconds,
        issuer: 'lawbid',
        audience: 'lawbid-reauth',
        jwtid: randomBytes(16).toString('hex'),
      },
    );
  }

  verifyReauthToken(token: string): ReauthTokenClaims & { jti: string } {
    const claims = this.verifyWithKeyRotation(token, 'reauth');
    return {
      sub: claims.sub as string,
      sid: claims.sid as string,
      jti: claims.jti as string,
    };
  }

  /** Opaque 256-bit refresh token + the SHA-256 hex hash that gets stored (never the raw value). */
  generateRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  refreshExpiryDate(from: Date = new Date()): Date {
    return new Date(from.getTime() + this.refreshTtlDays * 86_400_000);
  }

  accessTtlSecondsValue(): number {
    return this.accessTtlSeconds;
  }

  private activeSecret(): string {
    const secret = this.keys.get(this.activeKid);
    if (!secret) {
      // env.schema.ts already validates JWT_ACTIVE_KID is one of JWT_KEYS'
      // kids at boot, so this is unreachable in practice — guarding anyway
      // rather than a non-null assertion.
      throw new Error('JWT_ACTIVE_KID does not match any key in JWT_KEYS');
    }
    return secret;
  }

  private verifyWithKeyRotation(
    token: string,
    expectedTyp: 'access' | 'reauth',
  ): Record<string, unknown> {
    const decoded = this.jwt.decode(token, { complete: true }) as {
      header?: { kid?: string };
    } | null;
    const kid = decoded?.header?.kid;
    const secret = kid ? this.keys.get(kid) : undefined;
    if (!secret) {
      throw new TokenVerifyInvalidError('Unknown or missing key id');
    }

    const audience = expectedTyp === 'access' ? 'lawbid-app' : 'lawbid-reauth';
    try {
      const claims = this.jwt.verify<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
        issuer: 'lawbid',
        audience,
      });
      if (claims.typ !== expectedTyp) {
        throw new TokenVerifyInvalidError('Unexpected token type');
      }
      return claims;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new TokenVerifyExpiredError('Token expired');
      }
      if (error instanceof TokenVerifyInvalidError) {
        throw error;
      }
      throw new TokenVerifyInvalidError('Token verification failed');
    }
  }
}

import { JwtService } from '@nestjs/jwt';
import jwt from 'jsonwebtoken';
import {
  TokenService,
  TokenVerifyExpiredError,
  TokenVerifyInvalidError,
} from './token.service';

/** Stand-in for Nest's ConfigService — TokenService only ever calls
 * getOrThrow(), so that's the only method this needs to satisfy. */
class FakeConfigService {
  constructor(private readonly values: Record<string, unknown>) {}
  getOrThrow<T>(key: string): T {
    if (!(key in this.values))
      throw new Error(`FakeConfigService: missing ${key}`);
    return this.values[key] as T;
  }
}

const SECRET_1 = 'a'.repeat(32);
const SECRET_2 = 'b'.repeat(32);

function buildService(
  overrides: Partial<Record<string, unknown>> = {},
): TokenService {
  const config = new FakeConfigService({
    JWT_KEYS: `kid1:${SECRET_1},kid2:${SECRET_2}`,
    JWT_ACTIVE_KID: 'kid1',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_DAYS: 60,
    REAUTH_TOKEN_TTL_SECONDS: 300,
    ...overrides,
  });
  return new TokenService(new JwtService({}), config as never);
}

describe('TokenService', () => {
  it('signs and verifies an access token round-trip', () => {
    const service = buildService();
    const claims = {
      sub: 'user-1',
      role: 'client' as const,
      sid: 'chain-1',
      verified: false,
      subscriptionStatus: 'none',
    };
    const token = service.signAccessToken(claims);
    expect(service.verifyAccessToken(token)).toEqual(claims);
  });

  it('accepts a token signed under a non-active kid still listed in JWT_KEYS (rotation)', () => {
    // A token signed under kid2's secret (as if kid2 used to be active before
    // a rotation to kid1) must still verify — see TokenService's class doc:
    // "the active kid signs, every listed kid can verify."
    const token = jwt.sign(
      {
        sub: 'user-2',
        role: null,
        sid: 'chain-2',
        verified: false,
        subscriptionStatus: 'none',
        typ: 'access',
      },
      SECRET_2,
      {
        keyid: 'kid2',
        algorithm: 'HS256',
        expiresIn: 900,
        issuer: 'lawbid',
        audience: 'lawbid-app',
      },
    );
    const service = buildService();
    expect(service.verifyAccessToken(token).sub).toBe('user-2');
  });

  it('rejects a token whose kid is not in JWT_KEYS as TokenVerifyInvalidError, not expired', () => {
    const token = jwt.sign(
      {
        sub: 'user-3',
        role: 'client',
        sid: 'chain-3',
        verified: false,
        subscriptionStatus: 'none',
        typ: 'access',
      },
      'some-other-secret-not-in-the-map-xxxxxx',
      {
        keyid: 'unknown-kid',
        algorithm: 'HS256',
        expiresIn: 900,
        issuer: 'lawbid',
        audience: 'lawbid-app',
      },
    );
    const service = buildService();
    expect(() => service.verifyAccessToken(token)).toThrow(
      TokenVerifyInvalidError,
    );
  });

  it('distinguishes an EXPIRED token from every other invalid case (docs/01_FOUNDATION_AUTH.md §10.4: the dio interceptor keys off this exact distinction)', () => {
    const token = jwt.sign(
      {
        sub: 'user-4',
        role: 'client',
        sid: 'chain-4',
        verified: false,
        subscriptionStatus: 'none',
        typ: 'access',
      },
      SECRET_1,
      {
        keyid: 'kid1',
        algorithm: 'HS256',
        issuer: 'lawbid',
        audience: 'lawbid-app',
        // Already-expired: issued and expiring in the past.
        expiresIn: -10,
      },
    );
    const service = buildService();
    expect(() => service.verifyAccessToken(token)).toThrow(
      TokenVerifyExpiredError,
    );
  });

  it('rejects a reauth token presented where an access token is expected (typ mismatch)', () => {
    const service = buildService();
    const reauth = service.signReauthToken({ sub: 'user-5', sid: 'chain-5' });
    expect(() => service.verifyAccessToken(reauth)).toThrow(
      TokenVerifyInvalidError,
    );
  });

  it('generateRefreshToken/hashRefreshToken are consistent and never expose the hash as the raw value', () => {
    const service = buildService();
    const { raw, hash } = service.generateRefreshToken();
    expect(service.hashRefreshToken(raw)).toBe(hash);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});

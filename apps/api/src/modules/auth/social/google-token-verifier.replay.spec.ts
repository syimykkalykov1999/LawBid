import { GoogleTokenVerifier } from './google-token-verifier.service';

/** Detective R2B-9 (14.11): a leaked Google ID token could be replayed to
 * POST /auth/social until it expired (~1 h). Now the nonce bound into it
 * works once (Redis SET NX until the token expires, the one-time-nonce
 * rule of openid-client), and a token issued too long ago is refused
 * (`auth.social_token_max_age_sec`, default 600; 0 = no check). */
function setup(maxAge = 600) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'g-1',
    nonce: 'raw-nonce-1234567890',
    iat: now - 5,
    exp: now + 3600,
  };
  const store = new Map<string, string>();
  const redis = {
    set: jest.fn((k: string, v: string, ...opts: unknown[]) => {
      if (opts.includes('NX') && store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    }),
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'auth.social_token_max_age_sec' ? maxAge : NaN),
    ),
  };
  const v = new GoogleTokenVerifier(
    { get: () => 'client-id' } as never,
    undefined,
    redis as never,
    settings as never,
  );
  (v as unknown as { client: unknown }).client = {
    verifyIdToken: jest.fn(() =>
      Promise.resolve({ getPayload: () => payload }),
    ),
  };
  return { v, payload, redis };
}

describe('GoogleTokenVerifier replay guard (R2B-9)', () => {
  it('the same token + nonce works once', async () => {
    const { v } = setup();
    await expect(
      v.verify('tok', 'raw-nonce-1234567890'),
    ).resolves.toMatchObject({ providerUid: 'g-1' });
    await expect(v.verify('tok', 'raw-nonce-1234567890')).rejects.toMatchObject(
      {
        response: { code: 'AUTH_SOCIAL_TOKEN_INVALID' },
      },
    );
  });

  it('a token issued longer ago than the admin age is refused', async () => {
    const { v, payload } = setup(600);
    payload.iat -= 3000;
    await expect(v.verify('tok', 'raw-nonce-1234567890')).rejects.toMatchObject(
      {
        response: { code: 'AUTH_SOCIAL_TOKEN_INVALID' },
      },
    );
  });

  it('age check 0 = off', async () => {
    const { v, payload } = setup(0);
    payload.iat -= 3000;
    await expect(v.verify('tok', 'raw-nonce-1234567890')).resolves.toBeTruthy();
  });
});

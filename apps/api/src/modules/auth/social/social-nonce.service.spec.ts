import { SocialNonceService } from './social-nonce.service';
import { sha256Hex } from './nonce.util';

/** Detective R2B-9 (14.11): the Google sign-in nonce comes from the
 * server (POST /auth/social/nonce), lives `auth.social_nonce_ttl_sec` in
 * Redis and works once. A nonce the server never issued is accepted only
 * from an app older than `security.google_nonce_min_app_version`, and only
 * while that setting is filled in (the app of today makes its own). */
function setup(opts: { ttl?: number; minVersion?: string } = {}) {
  const store = new Map<string, { v: string; ttl: number }>();
  const redis = {
    set: jest.fn((k: string, v: string, _ex: string, ttl: number) => {
      store.set(k, { v, ttl });
      return Promise.resolve('OK');
    }),
    getdel: jest.fn((k: string) => {
      const hit = store.get(k);
      store.delete(k);
      return Promise.resolve(hit ? hit.v : null);
    }),
  };
  const settings = {
    number: jest.fn((k: string) =>
      Promise.resolve(
        k === 'auth.social_nonce_ttl_sec' ? (opts.ttl ?? 600) : NaN,
      ),
    ),
    string: jest.fn((k: string) =>
      Promise.resolve(
        k === 'security.google_nonce_min_app_version'
          ? (opts.minVersion ?? '')
          : '',
      ),
    ),
  };
  const service = new SocialNonceService(redis as never, settings as never);
  return { service, redis, store };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: { response?: { code?: string } }) => e.response?.code,
  );

describe('SocialNonceService (R2B-9)', () => {
  it('issues a long random nonce kept (hashed) for the admin TTL', async () => {
    const { service, store } = setup({ ttl: 120 });
    const before = Date.now();
    const out = await service.issue();
    expect(out.nonce).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    const hit = store.get(`auth:social:issued:${sha256Hex(out.nonce)}`);
    expect(hit?.ttl).toBe(120);
    expect(new Date(out.expiresAt).getTime()).toBeGreaterThanOrEqual(
      before + 119_000,
    );
    // The raw nonce is not stored as a key or value.
    expect([...store.keys()].join()).not.toContain(out.nonce);
  });

  it('a broken TTL setting falls back to 600 s', async () => {
    const { service, store } = setup({ ttl: -5 });
    await service.issue();
    expect([...store.values()][0].ttl).toBe(600);
  });

  it('an issued nonce works once, even with the rule on', async () => {
    const { service } = setup({ minVersion: '1.1.0' });
    const { nonce } = await service.issue();
    await expect(code(service.assertIssued(nonce, '1.1.0'))).resolves.toBe(
      'ok',
    );
    await expect(code(service.assertIssued(nonce, '1.1.0'))).resolves.toBe(
      'AUTH_SOCIAL_TOKEN_INVALID',
    );
  });

  it('a self-made nonce passes while the setting is empty (today’s app)', async () => {
    const { service } = setup({ minVersion: '' });
    await expect(
      code(service.assertIssued('client-made-nonce-123', '1.0.0')),
    ).resolves.toBe('ok');
  });

  it('a self-made nonce passes from an app older than the setting', async () => {
    const { service } = setup({ minVersion: '1.1.0' });
    await expect(
      code(service.assertIssued('client-made-nonce-123', '1.0.5')),
    ).resolves.toBe('ok');
  });

  it('a self-made nonce is refused from the setting version on, or with no version', async () => {
    const { service } = setup({ minVersion: '1.1.0' });
    await expect(
      code(service.assertIssued('client-made-nonce-123', '1.1.0')),
    ).resolves.toBe('AUTH_SOCIAL_TOKEN_INVALID');
    await expect(
      code(service.assertIssued('client-made-nonce-123', undefined)),
    ).resolves.toBe('AUTH_SOCIAL_TOKEN_INVALID');
  });
});

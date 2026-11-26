// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// ASVS 5.0 V3.3.3 (STAGE2_SECURITY #1): the admin JWT cookie is `__Host-`.
vi.mock('server-only', () => ({}));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.values.has(name) ? { name, value: jar.values.get(name) } : undefined,
  }),
}));

async function load(secure: 'true' | 'false') {
  vi.resetModules();
  vi.stubEnv('COOKIE_SECURE', secure);
  return import('./server');
}

afterEach(() => {
  jar.values.clear();
  vi.unstubAllEnvs();
});

describe('admin session cookie name', () => {
  it('is __Host-lawbid_admin with Secure, Path=/ and no Domain', async () => {
    const s = await load('true');
    expect(s.SESSION_COOKIE).toBe('__Host-lawbid_admin');
    const opts = s.cookieOptions(60);
    expect(opts).toMatchObject({ secure: true, path: '/' });
    expect(opts).not.toHaveProperty('domain');
  });

  it('reads the new name first, the legacy name as a one-release fallback', async () => {
    const s = await load('true');
    jar.values.set('lawbid_admin', 'old');
    expect(await s.sessionCookie()).toEqual({ token: 'old', legacy: true });
    jar.values.set('__Host-lawbid_admin', 'new');
    expect(await s.sessionCookie()).toEqual({ token: 'new', legacy: false });
    expect(await s.sessionToken()).toBe('new');
  });

  it('plain-http local development keeps the bare name', async () => {
    const s = await load('false');
    expect(s.SESSION_COOKIE).toBe('lawbid_admin');
    jar.values.set('lawbid_admin', 'dev');
    expect(await s.sessionCookie()).toEqual({ token: 'dev', legacy: false });
  });
});

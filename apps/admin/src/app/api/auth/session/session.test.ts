// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/server', () => ({
  SESSION_COOKIE: 'lawbid_admin',
  SESSION_MAX_AGE_SECONDS: 8 * 3600,
  apiBaseUrl: () => 'http://api.test/api/v1',
  cookieOptions: (maxAge: number) => ({
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: true,
    path: '/',
    maxAge,
  }),
  sessionToken: async () => 'tok',
}));

import { DELETE, POST } from './route';

afterEach(() => vi.unstubAllGlobals());

const post = (headers: Record<string, string> = {}) =>
  new Request('http://admin.test/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: JSON.stringify({ ticket: 't', code: '123456' }),
  });

describe('admin session route (S18-12)', () => {
  it('sets an httpOnly strict secure 8 h cookie and keeps the token out of the JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ data: { accessToken: 'jwt-secret', admin: { id: 'a1' } } }),
      ),
    );
    const res = await POST(post());
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('lawbid_admin=jwt-secret');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toContain('Max-Age=28800');
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('jwt-secret');
    expect(body).toContain('a1');
  });

  it('forwards only the load balancer entry of x-forwarded-for', async () => {
    const f = vi.fn(async () => Response.json({ error: { code: 'X' } }, { status: 401 }));
    vi.stubGlobal('fetch', f);
    await POST(post({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }));
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-forwarded-for']).toBe('1.2.3.4');
  });

  it('does not set a cookie when the API refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'ADMIN_TOTP_INVALID' } }, { status: 401 })));
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a cross-site sign-in', async () => {
    const res = await POST(post({ 'sec-fetch-site': 'cross-site' }));
    expect(res.status).toBe(403);
  });

  it('sign-out clears the cookie even when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('down'))));
    const res = await DELETE(
      new Request('http://admin.test/api/auth/session', {
        method: 'DELETE',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/lawbid_admin=;/);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});

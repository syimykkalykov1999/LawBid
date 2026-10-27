// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/server', () => ({
  SESSION_COOKIE: 'lawbid_admin',
  apiBaseUrl: () => 'http://api.test/api/v1',
  cookieOptions: () => ({}),
  sessionToken: async () => 'tok',
}));

import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from './[...path]/route';

afterEach(() => vi.unstubAllGlobals());

describe('admin proxy', () => {
  it('gives every API call a deadline and answers 504 when it passes', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: unknown, init: RequestInit) => {
        signal = init.signal ?? undefined;
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        return Promise.reject(err);
      }),
    );
    const res = await GET(new NextRequest('http://admin.test/api/proxy/users'), {
      params: Promise.resolve({ path: ['users'] }),
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('passes a normal answer through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );
    const res = await GET(new NextRequest('http://admin.test/api/proxy/users'), {
      params: Promise.resolve({ path: ['users'] }),
    });
    expect(res.status).toBe(200);
  });

  const ctx = { params: Promise.resolve({ path: ['users', 'u1', 'ban'] }) };
  const post = (headers: Record<string, string>, body = '{"a":1}') =>
    new NextRequest('http://admin.test/api/proxy/users/u1/ban', {
      method: 'POST',
      headers,
      body,
    });

  it('refuses a cross-site write (S18-5)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await POST(
      post({ 'content-type': 'application/json', 'sec-fetch-site': 'same-site' }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses a text/plain body (S18-5)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await POST(
      post({ 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' }),
      ctx,
    );
    expect(res.status).toBe(415);
    expect(f).not.toHaveBeenCalled();
  });

  it('answers 413 for a declared body over 25 MB (S18-6)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await POST(
      post({
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        'content-length': String(26 * 1024 * 1024),
      }),
      ctx,
    );
    expect(res.status).toBe(413);
    expect(f).not.toHaveBeenCalled();
  });

  it('streams a same-origin JSON write upstream (S18-6)', async () => {
    const f = vi.fn(async (_u: unknown, init: RequestInit & { duplex?: string }) => {
      expect(init.duplex).toBe('half');
      // Drain like a real fetch would.
      await new Response(init.body as ReadableStream).text();
      return new Response('{"ok":true}', { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    const res = await POST(
      post({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it('forwards the background marker so the API does not extend the session (S18-1)', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await GET(
      new NextRequest('http://admin.test/api/proxy/counts', { headers: { 'x-background': '1' } }),
      { params: Promise.resolve({ path: ['counts'] }) },
    );
    const init = (f.mock.calls[0] as unknown as [unknown, RequestInit])[1];
    expect((init.headers as Headers).get('x-background')).toBe('1');
  });

  it('clears the cookie when the API answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const res = await DELETE(
      new NextRequest('http://admin.test/api/proxy/users/u1', {
        method: 'DELETE',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
      { params: Promise.resolve({ path: ['users', 'u1'] }) },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toMatch(/lawbid_admin=;/);
  });
});

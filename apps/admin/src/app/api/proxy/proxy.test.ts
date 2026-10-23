// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/server', () => ({
  SESSION_COOKIE: 'lawbid_admin',
  apiBaseUrl: () => 'http://api.test/api/v1',
  cookieOptions: () => ({}),
  sessionToken: async () => 'tok',
}));

import { NextRequest } from 'next/server';
import { GET } from './[...path]/route';

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
});

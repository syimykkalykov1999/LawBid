// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/server', () => ({
  SESSION_COOKIE: 'lb_admin',
  apiBaseUrl: () => 'http://api.test',
  cookieOptions: () => ({ path: '/', maxAge: 0 }),
  sessionToken: async () => 'tok',
}));

const UPSTREAM_TIMEOUT_MS = 15_000;
const { GET, POST } = await import('./route');

const req = (method = 'GET') =>
  new NextRequest('http://admin.test/api/proxy/users', { method });
const ctx = { params: Promise.resolve({ path: ['users'] }) };

describe('admin proxy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('passes the API answer through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"data":1}', { status: 200 })),
    );
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 1 });
  });

  it('answers 502 JSON with Retry-After when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const res = await POST(req('POST'), ctx);
    expect(res.status).toBe(502);
    expect(res.headers.get('retry-after')).toBe('2');
    expect((await res.json()).error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('answers 504 JSON when the API does not answer in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const pending = GET(req(), ctx);
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS + 1);
    const res = await pending;
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe('UPSTREAM_TIMEOUT');
  });
});

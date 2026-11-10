import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/server', () => ({
  apiBaseUrl: () => 'https://api.example.test/api/v1',
  sessionToken: vi.fn(() => Promise.resolve('jwt')),
}));
vi.mock('@/lib/csrf', () => ({ crossSiteReason: () => null }));

describe('POST /api/realtime/ticket', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ADMIN_SOCKET_ORIGIN;
  });

  it('adds the API origin to the ticket the API issued', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { enabled: true, ticket: 't', namespace: '/admin', ttlSec: 60 } }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('./route');
    const res = await POST(new Request('https://admin.example.test/api/realtime/ticket', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { enabled: true, ticket: 't', namespace: '/admin', ttlSec: 60, origin: 'https://api.example.test' },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/v1/admin/realtime/ticket');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt');
  });

  it('ADMIN_SOCKET_ORIGIN wins over the API host', async () => {
    process.env.ADMIN_SOCKET_ORIGIN = 'https://rt.example.test/';
    const { socketOrigin } = await import('./route');
    expect(socketOrigin()).toBe('https://rt.example.test');
  });

  it('passes the API status through (switch off still 200, an API outage 502)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('down'))));
    const { POST } = await import('./route');
    const res = await POST(new Request('https://admin.example.test/api/realtime/ticket', { method: 'POST' }));
    expect(res.status).toBe(502);
  });
});

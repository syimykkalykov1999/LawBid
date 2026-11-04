import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setLastInput } from '../activity';
import createClient from 'openapi-fetch';
import { ApiError, toProxy } from './client';

// jsdom's Request wants absolute URLs; the browser resolves '/' itself.
const api = createClient<Record<string, never>>({
  baseUrl: 'http://localhost',
  // The stubbed global fetch, looked up per call.
  fetch: (r) => globalThis.fetch(r),
});
api.use(toProxy);

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/users', assign },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('admin api client (S18-12)', () => {
  it('on 401 sends the admin to /login with the page to come back to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 })),
    );
    await expect(api.GET('/admin/counts' as never)).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith('/login?next=%2Fusers');
  });

  it('marks reads made while nobody is at the screen as background (S18-1)', async () => {
    const f = vi.fn(async (r: Request) => (void r, Response.json({ data: {} })));
    vi.stubGlobal('fetch', f);
    __setLastInput(Date.now() - 10 * 60_000);
    await api.GET('/admin/counts' as never);
    expect(f.mock.calls[0]![0].headers.get('x-background')).toBe('1');
    __setLastInput(Date.now());
    await api.GET('/admin/counts' as never);
    expect(f.mock.calls[1]![0].headers.get('x-background')).toBeNull();
  });

  it('keeps a bodyless POST bodyless (no text/plain content type for the proxy)', async () => {
    // «Проверить» on an integration is a POST without a body. Materializing
    // it as '' made the browser add text/plain, and the proxy answered 415
    // «Send JSON or a multipart upload» (owner 2026-11-04).
    const f = vi.fn(async (r: Request) => (void r, Response.json({ data: {} })));
    vi.stubGlobal('fetch', f);
    await api.POST('/admin/integrations/x/versions/1/test' as never);
    const sent = f.mock.calls[0]![0];
    expect(sent.body).toBeNull();
    expect(sent.headers.get('content-type') ?? '').not.toMatch(/text\/plain/);
  });

  it('never marks a write as background', async () => {
    const f = vi.fn(async (r: Request) => (void r, Response.json({ data: {} })));
    vi.stubGlobal('fetch', f);
    __setLastInput(Date.now() - 10 * 60_000);
    await api.POST('/admin/x' as never, { body: {} } as never);
    expect(f.mock.calls[0]![0].headers.get('x-background')).toBeNull();
  });
});

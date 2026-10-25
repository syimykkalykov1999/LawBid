import type { Response } from 'express';
import { enforceCacheSafety, hasCredentials } from './http-cache';

function fakeRes(headers: Record<string, string> = {}) {
  const h = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    getHeader: (k: string) => h.get(k.toLowerCase()),
    setHeader: (k: string, v: string) => void h.set(k.toLowerCase(), v),
    h,
  } as unknown as Response & { h: Map<string, string> };
}
const get = (headers: Record<string, string> = {}) =>
  ({ method: 'GET', headers }) as never;

/** Batch C item 14: nothing personal reaches a shared cache. */
describe('enforceCacheSafety', () => {
  it('keeps public for a credential-less GET and adds Vary', () => {
    const res = fakeRes({ 'Cache-Control': 'public, max-age=300' });
    enforceCacheSafety(get(), res, 200);
    expect(res.h.get('cache-control')).toBe('public, max-age=300');
    expect(res.h.get('vary')).toBe('Authorization, Accept-Language');
  });

  it('turns public into private when the request carried a token', () => {
    const res = fakeRes({
      'Cache-Control':
        'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
    });
    enforceCacheSafety(get({ authorization: 'Bearer x' }), res, 200);
    const cc = res.h.get('cache-control') ?? '';
    expect(cc).toContain('private');
    expect(cc).not.toMatch(/public|s-maxage/);
    expect(res.h.get('vary')).toContain('Authorization');
  });

  it('a cookie or the demo header also counts as a credential', () => {
    expect(hasCredentials({ headers: { cookie: 'a=b' } } as never)).toBe(true);
    expect(hasCredentials({ headers: { 'x-lawbid-demo': '1' } } as never)).toBe(
      true,
    );
    expect(hasCredentials({ headers: {} } as never)).toBe(false);
  });

  it('labels an unlabelled answer private, no-cache', () => {
    const res = fakeRes();
    enforceCacheSafety(get({ authorization: 'Bearer x' }), res, 200);
    expect(res.h.get('cache-control')).toBe('private, no-cache');
  });

  it('never shares writes, errors or cookie-setting answers', () => {
    const post = fakeRes({ 'Cache-Control': 'public, max-age=60' });
    enforceCacheSafety({ method: 'POST', headers: {} } as never, post, 200);
    expect(post.h.get('cache-control')).toBe('no-store');
    const err = fakeRes({ 'Cache-Control': 'public, max-age=60' });
    enforceCacheSafety(get(), err, 500);
    expect(err.h.get('cache-control')).toBe('no-store');
    const cookie = fakeRes({
      'Cache-Control': 'public, max-age=60',
      'Set-Cookie': 'a=b',
    });
    enforceCacheSafety(get(), cookie, 200);
    expect(cookie.h.get('cache-control')).toBe('private, no-store');
  });

  it('leaves an explicit no-store and a 304 alone', () => {
    const a = fakeRes({ 'Cache-Control': 'no-store' });
    enforceCacheSafety(get(), a, 200);
    expect(a.h.get('cache-control')).toBe('no-store');
    const b = fakeRes();
    enforceCacheSafety(get(), b, 304);
    expect(b.h.get('cache-control')).toBeUndefined();
  });
});

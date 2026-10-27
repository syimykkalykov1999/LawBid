import type { ConfigService } from '@nestjs/config';
import {
  MANIFEST_CACHE_MS,
  SeoManifestService,
  summarizeManifest,
} from './seo-manifest.service';

const manifest = {
  version: 1,
  builtAt: '2026-10-27',
  pages: {
    '/lawyers/ny/': { hash: 'a', lastmod: '2026-10-27', index: true },
    '/lawyers/tx/': { hash: 'b', lastmod: '2026-10-27', index: true },
    '/attorneys/x/': { hash: 'c', lastmod: '2026-10-27', index: false },
  },
  ramp: { perDay: 200, date: '2026-10-27', deferred: 12 },
};

const service = (base?: string) =>
  new SeoManifestService({
    get: () => base,
  } as unknown as ConfigService);

describe('summarizeManifest', () => {
  it('counts published, indexed and noindex pages and reads the ramp', () => {
    expect(summarizeManifest(manifest)).toEqual({
      builtAt: '2026-10-27',
      pages: 3,
      indexed: 2,
      noindex: 1,
      rampPerDay: 200,
      rampDeferred: 12,
    });
  });

  it('works without a ramp and tolerates junk', () => {
    const noRamp = { ...manifest, ramp: undefined };
    expect(summarizeManifest(noRamp)).toMatchObject({
      rampPerDay: null,
      rampDeferred: null,
    });
    expect(summarizeManifest(null)).toBeNull();
    expect(summarizeManifest([])).toBeNull();
    expect(summarizeManifest({ pages: [] })).toBeNull();
    expect(
      summarizeManifest({ pages: { '/a/': 1 }, builtAt: 'yesterday' }),
    ).toMatchObject({ builtAt: null, pages: 1, indexed: 0, noindex: 1 });
  });
});

describe('SeoManifestService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const okJson = (body: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

  it('reads <site>/seo-manifest.json and caches the answer for 10 minutes', async () => {
    const f = jest.fn(() => okJson(manifest));
    global.fetch = f;
    const s = service('https://lawbid.example/');
    const t0 = 1_000_000;
    const a = await s.status(t0);
    expect(f).toHaveBeenCalledWith(
      'https://lawbid.example/seo-manifest.json',
      expect.anything(),
    );
    expect(a.manifest?.indexed).toBe(2);
    expect(a.error).toBeNull();
    await s.status(t0 + MANIFEST_CACHE_MS - 1);
    expect(f).toHaveBeenCalledTimes(1);
    await s.status(t0 + MANIFEST_CACHE_MS + 1);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('falls back to the public origin when the base is not set', () => {
    expect(service(undefined).url()).toBe(
      'https://lawbid.app/seo-manifest.json',
    );
  });

  it('a missing file is a calm message, not an error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(new Response('', { status: 404 })),
    );
    const r = await service('https://x.test').status(1);
    expect(r.manifest).toBeNull();
    expect(r.error).toContain('seo-manifest.json');
  });

  it('a network failure is tolerated and retried soon, not on every open', async () => {
    const f = jest.fn(() => Promise.reject(new Error('offline')));
    global.fetch = f;
    const s = service('https://x.test');
    const r = await s.status(10);
    expect(r).toMatchObject({ manifest: null });
    expect(r.error).toBeTruthy();
    await s.status(20);
    expect(f).toHaveBeenCalledTimes(1);
    await s.status(10 + 61_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('refuses a huge file and a wrong shape', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'content-length': '999999999' },
        }),
      ),
    );
    expect((await service('https://x.test').status(1)).manifest).toBeNull();
    global.fetch = jest.fn(() => okJson({ nope: true }));
    const r = await service('https://x.test').status(1);
    expect(r.manifest).toBeNull();
    expect(r.error).toContain('формате');
  });
});

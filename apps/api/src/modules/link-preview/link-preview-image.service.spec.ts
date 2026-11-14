import sharp from 'sharp';
import { LinkPreviewImageService } from './link-preview-image.service';
import { LinkPreviewService } from './link-preview.service';
import * as safeFetch from './safe-fetch';
import { SafeFetchError } from './safe-fetch';

/** Media batch A (R7, audit 13.11): the link card's picture came straight
 * from the third-party site (reader's IP leaked, size uncapped). */
function setup(over: { images?: boolean; stored?: boolean } = {}) {
  const settings = {
    boolean: jest.fn(() => Promise.resolve(over.images ?? true)),
    number: jest.fn((k: string) =>
      Promise.resolve(
        (
          {
            'chat.link_preview_image_max_kb': 64,
            'chat.link_preview_image_timeout_ms': 2000,
            'chat.link_preview_image_px': 600,
          } as Record<string, number>
        )[k],
      ),
    ),
  };
  const storage = {
    resolveBucket: jest.fn(() => Promise.resolve('lawbid-public-r2')),
    head: jest.fn(() =>
      Promise.resolve(
        over.stored ? { size: 1, contentType: 'image/webp' } : null,
      ),
    ),
    put: jest.fn(() => Promise.resolve()),
  };
  const files = {
    publicMediaLink: jest.fn((_b: string, k: string) =>
      Promise.resolve(`https://media.lawbid.dev/${k}`),
    ),
  };
  const svc = new LinkPreviewImageService(
    settings as never,
    storage as never,
    files as never,
  );
  return { svc, settings, storage, files };
}

const opts = { allowLocal: false };

describe('link preview pictures are re-hosted (R7)', () => {
  it('downloads once, stores a ≤600 px WebP and answers OUR link', async () => {
    const png = await sharp({
      create: { width: 1600, height: 800, channels: 3, background: '#c33' },
    })
      .png()
      .toBuffer();
    const { svc, storage } = setup();
    svc.fetchImage = jest.fn().mockResolvedValue({
      finalUrl: new URL('https://site.example/og.png'),
      body: png,
      contentType: 'image/png',
    });
    const link = await svc.rehost('https://site.example/og.png', opts);
    expect(link).toMatch(
      /^https:\/\/media\.lawbid\.dev\/link-preview\/[0-9a-f]{64}\.webp$/,
    );
    expect(link).not.toContain('site.example');
    // The download caps come from the admin settings.
    expect(svc.fetchImage).toHaveBeenCalledWith(
      'https://site.example/og.png',
      expect.objectContaining({ maxBytes: 64 * 1024, timeoutMs: 2000 }),
    );
    const [bucket, key, body, type] = (storage.put.mock.calls[0] ??
      []) as unknown as [string, string, Buffer, string];
    expect(bucket).toBe('lawbid-public-r2');
    expect(key).toMatch(/^link-preview\//);
    expect(type).toBe('image/webp');
    const meta = await sharp(body).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(600);
  });

  it('a picture already stored is not downloaded again', async () => {
    const { svc, storage } = setup({ stored: true });
    svc.fetchImage = jest.fn();
    expect(await svc.rehost('https://site.example/og.png', opts)).toMatch(
      /link-preview\//,
    );
    expect(svc.fetchImage).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('too large, blocked, not an image or switched off → no picture, never the site URL', async () => {
    const big = setup();
    big.svc.fetchImage = jest
      .fn()
      .mockRejectedValue(new SafeFetchError('too_large'));
    expect(await big.svc.rehost('https://site.example/x.png', opts)).toBeNull();

    const junk = setup();
    junk.svc.fetchImage = jest.fn().mockResolvedValue({
      finalUrl: new URL('https://site.example/x.png'),
      body: Buffer.from('not an image'),
      contentType: 'image/png',
    });
    expect(
      await junk.svc.rehost('https://site.example/x.png', opts),
    ).toBeNull();
    expect(junk.storage.put).not.toHaveBeenCalled();

    const off = setup({ images: false });
    off.svc.fetchImage = jest.fn();
    expect(await off.svc.rehost('https://site.example/x.png', opts)).toBeNull();
    expect(off.svc.fetchImage).not.toHaveBeenCalled();
  });
});

describe('the link card never carries the third-party picture URL', () => {
  it('without the re-host service the card has no picture', async () => {
    const limiter = {
      consumeFixedWindow: jest.fn(() =>
        Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
      ),
    };
    const settings = {
      raw: jest.fn(() => Promise.resolve('on')),
      number: jest.fn(() => Promise.resolve(50)),
      stringList: jest.fn(() => Promise.resolve([])),
    };
    const svc = new LinkPreviewService(
      {
        get: jest.fn(() => Promise.resolve(null)),
        set: jest.fn(() => Promise.resolve('OK')),
      } as never,
      limiter as never,
      settings as never,
      { get: jest.fn(() => 'test') } as never,
    );
    const internals = svc as unknown as {
      fetchAndStore: (
        k: string,
        u: string,
        d: (h: string) => boolean,
      ) => Promise<{ imageUrl: string | null }>;
    };
    // A page that names a third-party og:image (served by a stub fetch).
    jest.spyOn(safeFetch, 'safeFetchHtml').mockResolvedValue({
      finalUrl: new URL('https://site.example/a'),
      status: 200,
      html: '<meta property="og:title" content="T"><meta property="og:image" content="https://tracker.example/p.png">',
    });
    const card = await internals.fetchAndStore(
      'k',
      'https://site.example/a',
      () => false,
    );
    expect(card.imageUrl).toBeNull();
  });
});

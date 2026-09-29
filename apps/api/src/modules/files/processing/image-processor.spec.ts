import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { ImageProcessor } from './image-processor';
import { detectMime } from '../magic-bytes';
import { MAX_INPUT_PIXELS } from '../files.policy';

/** A tiny PNG whose IHDR claims `w`×`h` — a decompression-bomb header
 * without the bomb (CRC recomputed so decoders accept the chunk). */
async function pngClaiming(w: number, h: number): Promise<Buffer> {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  // signature(8) + length(4) + "IHDR"(4) → width @16, height @20, crc @29.
  png.writeUInt32BE(w, 16);
  png.writeUInt32BE(h, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
}

describe('ImageProcessor', () => {
  const processor = new ImageProcessor();
  const heic = readFileSync(
    join(__dirname, '../../../../test/fixtures/sample.heic'),
  );

  const jpegWithExif = (w: number, h: number): Promise<Buffer> =>
    sharp({
      create: { width: w, height: h, channels: 3, background: '#223366' },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Copyright: 'secret-gps-owner' } },
      })
      .toBuffer();

  it('converts HEIC to JPEG', async () => {
    const out = await processor.process({
      data: heic,
      mime: 'image/heic',
      avatar: false,
    });
    expect(out.main?.mime).toBe('image/jpeg');
    expect(detectMime(out.main!.data)).toBe('image/jpeg');
    expect([out.width, out.height]).toEqual([64, 48]);
  });

  it('post photo: oriented, ≤2048 px, 320/1080 variants, EXIF stripped', async () => {
    const src = await jpegWithExif(3000, 2000); // orientation 6 → portrait
    const out = await processor.process({
      data: src,
      mime: 'image/jpeg',
      avatar: false,
      postImage: true,
    });
    expect([out.main?.width, out.main?.height]).toEqual([1365, 2048]);
    expect((await sharp(out.main!.data).metadata()).exif).toBeUndefined();
    expect(out.variants.get(320)?.height).toBe(320);
    expect(out.variants.get(1080)?.height).toBe(1080);
  });

  it('avatar: square crop, 1024 max + 256 variant, EXIF stripped', async () => {
    const src = await jpegWithExif(2000, 1200);
    expect((await sharp(src).metadata()).exif).toBeDefined();
    const out = await processor.process({
      data: src,
      mime: 'image/jpeg',
      avatar: true,
    });
    expect([out.main?.width, out.main?.height]).toEqual([1024, 1024]);
    const meta = await sharp(out.main!.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(out.main!.data.includes('secret-gps-owner')).toBe(false);
    const v = out.variants.get(256)!;
    expect([v.width, v.height]).toEqual([256, 256]);
    expect((await sharp(v.data).metadata()).exif).toBeUndefined();
  });

  it('avatar from HEIC and from a small PNG (never upscaled)', async () => {
    const fromHeic = await processor.process({
      data: heic,
      mime: 'image/heic',
      avatar: true,
    });
    expect([fromHeic.width, fromHeic.height]).toEqual([48, 48]);
    const png = await sharp({
      create: { width: 300, height: 500, channels: 4, background: '#00000000' },
    })
      .png()
      .toBuffer();
    const out = await processor.process({
      data: png,
      mime: 'image/png',
      avatar: true,
    });
    expect([out.width, out.height]).toEqual([300, 300]);
    expect(out.main?.mime).toBe('image/jpeg');
  });

  it('keeps JPEG/PNG/PDF documents as uploaded, reports oriented dimensions', async () => {
    const src = await jpegWithExif(40, 20);
    const out = await processor.process({
      data: src,
      mime: 'image/jpeg',
      avatar: false,
    });
    expect(out.main).toBeNull();
    expect([out.width, out.height]).toEqual([20, 40]);
    const pdf = await processor.process({
      data: Buffer.from('%PDF-1.4'),
      mime: 'application/pdf',
      avatar: false,
    });
    expect(pdf).toEqual({
      main: null,
      variants: new Map(),
      width: null,
      height: null,
    });
  });

  it('rejects a corrupt image', async () => {
    await expect(
      processor.process({
        data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
        mime: 'image/jpeg',
        avatar: true,
      }),
    ).rejects.toThrow();
  });

  it('rejects an image above MAX_INPUT_PIXELS before decoding (avatar and document)', async () => {
    const bomb = await pngClaiming(10_000, 10_000);
    expect(10_000 * 10_000).toBeGreaterThan(MAX_INPUT_PIXELS);
    expect((await sharp(bomb).metadata()).width).toBe(10_000);
    for (const avatar of [true, false]) {
      await expect(
        processor.process({ data: bomb, mime: 'image/png', avatar }),
      ).rejects.toThrow(/pixel/i);
    }
  });
});

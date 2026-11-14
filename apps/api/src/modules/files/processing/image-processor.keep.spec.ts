import sharp from 'sharp';
import { ImageProcessor } from './image-processor';

/**
 * Owner row 106 (media audit 13.11, batch F item 14): a photo the app
 * already made small is stored as sent; only the smaller sizes are made.
 */
describe('ImageProcessor keepSmallOriginal', () => {
  const processor = new ImageProcessor();
  const photo = (w: number, h: number) =>
    sharp({
      create: { width: w, height: h, channels: 3, background: '#335577' },
    });

  it('a 1600 px JPEG without metadata is kept byte for byte', async () => {
    const data = await photo(1600, 1200).jpeg({ quality: 82 }).toBuffer();
    const out = await processor.process({
      data,
      mime: 'image/jpeg',
      avatar: false,
      postImage: true,
      format: 'webp',
      keepSmallOriginal: true,
    });
    expect(out.main?.data.equals(data)).toBe(true);
    expect(out.main?.mime).toBe('image/jpeg');
    expect([out.width, out.height]).toEqual([1600, 1200]);
    const w320 = await sharp(out.variants.get(320)!.data).metadata();
    const w1080 = await sharp(out.variants.get(1080)!.data).metadata();
    expect([w320.width, w320.format]).toEqual([320, 'webp']);
    expect([w1080.width, w1080.format]).toEqual([1080, 'webp']);
  });

  it('a photo under 1080 px: the 1080 size is the photo itself', async () => {
    const data = await photo(900, 600).webp().toBuffer();
    const out = await processor.process({
      data,
      mime: 'image/webp',
      avatar: false,
      postImage: true,
      format: 'webp',
      keepSmallOriginal: true,
    });
    expect(out.main?.data.equals(data)).toBe(true);
    expect(out.variants.get(1080)).toBe(out.main);
    expect((await sharp(out.variants.get(320)!.data).metadata()).width).toBe(
      320,
    );
  });

  it('EXIF (GPS!), a rotation or too many pixels: re-encoded as before', async () => {
    const exif = await photo(800, 600)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'gps-owner' } } })
      .toBuffer();
    const rotated = await photo(800, 600)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const big = await photo(3000, 2000).jpeg().toBuffer();
    for (const data of [exif, rotated, big]) {
      const out = await processor.process({
        data,
        mime: 'image/jpeg',
        avatar: false,
        postImage: true,
        format: 'webp',
        keepSmallOriginal: true,
      });
      expect(out.main?.data.equals(data)).toBe(false);
      expect(out.main?.mime).toBe('image/webp');
      expect((await sharp(out.main!.data).metadata()).exif).toBeUndefined();
    }
  });

  it('switch off: every photo re-encoded (today)', async () => {
    const data = await photo(1600, 1200).jpeg({ quality: 82 }).toBuffer();
    const out = await processor.process({
      data,
      mime: 'image/jpeg',
      avatar: false,
      postImage: true,
      format: 'webp',
    });
    expect(out.main?.mime).toBe('image/webp');
  });

  it('AVIF on: the kept photo still gets its twin when smaller', async () => {
    const data = await photo(1200, 800).jpeg({ quality: 95 }).toBuffer();
    const out = await processor.process({
      data,
      mime: 'image/jpeg',
      avatar: false,
      postImage: true,
      format: 'webp',
      quality: { jpeg: 90, webp: 88, avif: { quality: 60, effort: 2 } },
      keepSmallOriginal: true,
    });
    expect(out.main?.data.equals(data)).toBe(true);
    expect(out.main?.avif?.mime).toBe('image/avif');
  });
});

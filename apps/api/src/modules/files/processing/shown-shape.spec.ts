import sharp from 'sharp';
import { SHOWN_SHAPE_MAX_SIDE, shownShape } from './shown-shape';

const photo = (w: number, h: number) =>
  sharp({
    create: { width: w, height: h, channels: 3, background: '#808080' },
  });

describe('shownShape (owner 27.11: a photo has its shape before the check)', () => {
  it('reads a PNG and a JPEG header', async () => {
    expect(
      await shownShape(await photo(30, 40).png().toBuffer(), 'image/png'),
    ).toEqual({ width: 30, height: 40 });
    expect(
      await shownShape(await photo(64, 48).jpeg().toBuffer(), 'image/jpeg'),
    ).toEqual({ width: 64, height: 48 });
  });

  it('EXIF orientation 6 (a phone held upright) swaps the sides', async () => {
    const jpeg = await photo(64, 48)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(await shownShape(jpeg, 'image/jpeg')).toEqual({
      width: 48,
      height: 64,
    });
  });

  it('the start of a big file is enough (header only)', async () => {
    const jpeg = await photo(800, 600).jpeg().toBuffer();
    expect(await shownShape(jpeg.subarray(0, 2048), 'image/jpeg')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('nothing for documents, broken bytes or HEIC', async () => {
    expect(
      await shownShape(Buffer.from('%PDF-1.7'), 'application/pdf'),
    ).toBeNull();
    expect(await shownShape(Buffer.from('garbage'), 'image/jpeg')).toBeNull();
    expect(await shownShape(Buffer.alloc(10), 'image/heic')).toBeNull();
  });

  it('a sane bound', () => {
    expect(SHOWN_SHAPE_MAX_SIDE).toBe(65_535);
  });
});

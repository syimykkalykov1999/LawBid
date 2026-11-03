import sharp from 'sharp';
import { computeBlurhash } from './blurhash';

describe('computeBlurhash', () => {
  it('returns a short 4x3 hash for an image', async () => {
    const png = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const hash = await computeBlurhash(png);
    expect(hash).toMatch(/^[0-9A-Za-z#$%*+,\-.:;=?@[\]^_{|}~]{20,40}$/);
  });

  it('is null for bytes that are not an image', async () => {
    expect(await computeBlurhash(Buffer.from('not an image'))).toBeNull();
  });
});
